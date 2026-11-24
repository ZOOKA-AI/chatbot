"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { normalizeCode } from "@/lib/affiliate";
import { recordPlatformAudit, requirePlatformRole } from "@/lib/auth/platform-role";
import { db } from "@/lib/db/queries";
import { affiliate } from "@/lib/db/schema";

/**
 * Creating or changing a partner's commission is a money decision, so it needs
 * the super-admin grant and goes through a server action (POST, same-origin
 * checked by Next) instead of the GET query string it used to ride on.
 */
export async function addAffiliateAction(formData: FormData) {
  const admin = await requirePlatformRole("super_admin", "admin.referrals.upsert");
  if (!admin) {
    return;
  }
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : undefined;
  };
  const normalized = normalizeCode(text("code") ?? "");
  if (!normalized) {
    return;
  }
  const parsed = Number.parseInt(text("pct") ?? "20", 10);
  const commissionPct = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : 20;
  const values = {
    name: text("name") ?? null,
    platform: text("platform") ?? null,
    commissionPct,
  };

  const existing = await db
    .select({ id: affiliate.id })
    .from(affiliate)
    .where(eq(affiliate.code, normalized))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(affiliate)
      .set({
        name: values.name,
        platform: values.platform,
        commissionPct,
      })
      .where(eq(affiliate.code, normalized));
    await recordPlatformAudit({ actorUserId: admin.userId, action: "admin.referrals.upsert", target: normalized, outcome: "allowed", metadata: { ...values, mode: "update" } });
    revalidatePath("/admin/referrals");
    return;
  }

  await db.insert(affiliate).values({
    code: normalized,
    name: values.name,
    platform: values.platform,
    commissionPct,
  });
  await recordPlatformAudit({
    actorUserId: admin.userId,
    action: "admin.referrals.upsert",
    target: normalized,
    outcome: "allowed",
    metadata: { ...values, mode: "insert" },
  });
  revalidatePath("/admin/referrals");
}
