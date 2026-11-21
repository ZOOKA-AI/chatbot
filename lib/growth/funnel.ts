import "server-only";

import { sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";

/**
 * The acquisition-to-usage funnel, read from our own tables.
 *
 * Before migration 0067 this query was impossible: no signup time and no
 * channel. It answers the only question that decides where to spend effort -
 * which channel brings people who actually use the product - instead of which
 * channel brings the most visits.
 *
 * Activity is read from "UsageEvent", which every real agent action writes, so
 * "activated" means the account did something, not that it merely exists.
 * Accounts created before 0067 have no channel and are reported separately
 * rather than attributed to a guess.
 */
export interface FunnelRow {
  source: string;
  signups: number;
  activated: number;
  activeLast7d: number;
}

export interface FunnelReport {
  days: number;
  rows: FunnelRow[];
  totals: {
    signups: number;
    activated: number;
    activeLast7d: number;
    unattributedSignups: number;
  };
}

export async function getGrowthFunnel(days = 30): Promise<FunnelReport> {
  const window = Math.min(Math.max(Math.trunc(days), 1), 365);

  const rows = (await adminDb().execute(sql`
    with signups as (
      select
        id,
        coalesce("signupSource", 'unknown') as source,
        "createdAt"
      from "User"
      where "createdAt" >= now() - (${window} || ' days')::interval
    ),
    activity as (
      select
        "userId",
        count(*) as events,
        max("createdAt") as last_event
      from "UsageEvent"
      group by "userId"
    )
    select
      s.source as source,
      count(*)::int as signups,
      count(a."userId")::int as activated,
      count(case when a.last_event >= now() - interval '7 days' then 1 end)::int
        as active_last_7d
    from signups s
    left join activity a on a."userId" = s.id
    group by s.source
    order by count(*) desc
  `)) as unknown as Record<string, unknown>[];

  const parsed: FunnelRow[] = rows.map((row) => ({
    source: String(row.source),
    signups: Number(row.signups ?? 0),
    activated: Number(row.activated ?? 0),
    activeLast7d: Number(row.active_last_7d ?? 0),
  }));

  const sum = (pick: (row: FunnelRow) => number) =>
    parsed.reduce((total, row) => total + pick(row), 0);

  return {
    days: window,
    rows: parsed,
    totals: {
      signups: sum((row) => row.signups),
      activated: sum((row) => row.activated),
      activeLast7d: sum((row) => row.activeLast7d),
      unattributedSignups:
        parsed.find((row) => row.source === "unknown")?.signups ?? 0,
    },
  };
}
