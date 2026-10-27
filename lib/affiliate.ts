import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { referralEvent } from "@/lib/db/schema";

export const REFERRAL_COOKIE = "zk_ref";
export const REFERRAL_COOKIE_DAYS = 60;

export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return clean.length > 0 ? clean.slice(0, 64) : null;
}

type ReferralEventInput = {
  code: string;
  event: "click" | "signup" | "subscribe";
  userId?: string | null;
  organizationId?: string | null;
  plan?: string | null;
  amountCents?: number | null;
  externalRef?: string | null;
};

export async function recordReferralEvent(input: ReferralEventInput) {
  const code = normalizeCode(input.code);
  if (!code) {
    return;
  }
  try {
    if (input.externalRef) {
      const existing = await db
        .select({ id: referralEvent.id })
        .from(referralEvent)
        .where(sql`${referralEvent.externalRef} = ${input.externalRef}`)
        .limit(1);
      if (existing.length > 0) {
        return;
      }
    }
    await db.insert(referralEvent).values({
      code,
      event: input.event,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      plan: input.plan ?? null,
      amountCents: input.amountCents ?? null,
      externalRef: input.externalRef ?? null,
    });
  } catch (error) {
    console.error("Failed to record referral event", error);
  }
}

export type ReferralRow = {
  code: string;
  clicks: number;
  signups: number;
  subscriptions: number;
  mrrCents: number;
};

export async function getReferralReport(): Promise<ReferralRow[]> {
  const rows = await db
    .select({
      code: referralEvent.code,
      clicks: sql<string>`count(*) filter (where ${referralEvent.event} = 'click')`,
      signups: sql<string>`count(*) filter (where ${referralEvent.event} = 'signup')`,
      subscriptions: sql<string>`count(*) filter (where ${referralEvent.event} = 'subscribe')`,
      mrrCents: sql<string>`coalesce(sum(${referralEvent.amountCents}) filter (where ${referralEvent.event} = 'subscribe'), 0)`,
    })
    .from(referralEvent)
    .groupBy(referralEvent.code);

  return rows
    .map((row) => ({
      code: row.code,
      clicks: Number(row.clicks ?? 0),
      signups: Number(row.signups ?? 0),
      subscriptions: Number(row.subscriptions ?? 0),
      mrrCents: Number(row.mrrCents ?? 0),
    }))
    .sort((a, b) => b.mrrCents - a.mrrCents || b.clicks - a.clicks);
}
