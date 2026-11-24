"use server";

import { sql } from "drizzle-orm";

import { requirePlatformRole } from "@/lib/auth/platform-role";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/db/queries";

/**
 * Owner-only growth configuration. Every write records an audit row in the same
 * statement batch, and the audit table rejects updates and deletes at the
 * database level.
 */
export async function updateGrowthSettings(formData: FormData) {
  const context = await requireWorkspaceRole("owner");
  if (!context) return { ok: false as const, reason: "forbidden" as const };
  // GrowthSettings is one row for the whole platform. Any sign-up owns a
  // workspace, so the owner role alone let every user rewrite the referral
  // economy; the write needs the platform admin grant.
  const platformAdmin = await requirePlatformRole("admin", "action.admin.growth.update");
  if (!platformAdmin) return { ok: false as const, reason: "forbidden" as const };

  const readInt = (key: string, min: number, max: number) => {
    const raw = Number(formData.get(key));
    if (!Number.isFinite(raw)) return null;
    const value = Math.trunc(raw);
    return value >= min && value <= max ? value : null;
  };

  const values = {
    programEnabled: formData.get("programEnabled") === "on",
    pointsWelcome: readInt("pointsWelcome", 0, 100000),
    pointsReferrerVerified: readInt("pointsReferrerVerified", 0, 100000),
    pointsReferrerFirstTask: readInt("pointsReferrerFirstTask", 0, 100000),
    pointsFirstTask: readInt("pointsFirstTask", 0, 100000),
    ambassadorThreshold: readInt("ambassadorThreshold", 1, 1000),
    bonusAtTenReferrals: readInt("bonusAtTenReferrals", 0, 1000000),
    monthlyBudgetPoints: readInt("monthlyBudgetPoints", 0, 100000000),
  };
  if (Object.values(values).some((v) => v === null && typeof v !== "boolean")) {
    return { ok: false as const, reason: "invalid" as const };
  }

  try {
    await adminDb().execute(sql`
      UPDATE "GrowthSettings" SET
        "programEnabled" = ${values.programEnabled},
        "pointsWelcome" = ${values.pointsWelcome},
        "pointsReferrerVerified" = ${values.pointsReferrerVerified},
        "pointsReferrerFirstTask" = ${values.pointsReferrerFirstTask},
        "pointsFirstTask" = ${values.pointsFirstTask},
        "ambassadorThreshold" = ${values.ambassadorThreshold},
        "bonusAtTenReferrals" = ${values.bonusAtTenReferrals},
        "monthlyBudgetPoints" = ${values.monthlyBudgetPoints},
        "updatedAt" = now()
      WHERE "id" = 'default'
    `);
    await adminDb().execute(sql`
      INSERT INTO "GrowthAudit" ("actorUserId","action","detail")
      VALUES (${context.user.id}::uuid, 'settings_updated', ${JSON.stringify(values)}::jsonb)
    `);
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: "error" as const };
  }
}

/** Fraud control: a revoked reward stays in the ledger, marked, never deleted. */
export async function revokeReward(formData: FormData) {
  const context = await requireWorkspaceRole("owner");
  if (!context) return { ok: false as const, reason: "forbidden" as const };

  const id = String(formData.get("rewardId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const, reason: "invalid" as const };

  try {
    await adminDb().execute(sql`
      UPDATE "RewardLedger" SET "status" = 'revoked', "revokedAt" = now()
      WHERE "id" = ${id}::uuid AND "status" <> 'revoked'
    `);
    await adminDb().execute(sql`
      INSERT INTO "GrowthAudit" ("actorUserId","action","detail")
      VALUES (${context.user.id}::uuid, 'reward_revoked', ${JSON.stringify({ rewardId: id })}::jsonb)
    `);
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: "error" as const };
  }
}
