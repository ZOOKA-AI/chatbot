import "server-only";

import { sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";
import {
  buildJourneyReport,
  type JourneyCounts,
  type JourneyReport,
} from "@/lib/growth/journey-report";

/**
 * Reads the journey from tables that already exist. Read-only, counts only:
 * no user id, email or key leaves this function.
 *
 * - Demo: "GuestUsage" rows keyed `guest:<browser>:<day>`, the same rows that
 *   enforce the daily demo quota. Only `ip:` rows are ever pruned.
 * - Signup: "User"."createdAt" (migration 0067), excluding internal guest users.
 * - Connection / success: joined through "OrganizationMember" to the user's
 *   workspace.
 *
 * Each step is read on its own, so one missing table or column turns that step
 * into null instead of hiding the whole report.
 */
async function count(query: ReturnType<typeof sql>): Promise<Record<string, unknown> | null> {
  try {
    const rows = (await adminDb().execute(query)) as unknown as Record<
      string,
      unknown
    >[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

const asNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function getJourney(days = 30): Promise<JourneyReport> {
  const window = Math.min(Math.max(Math.trunc(days), 1), 365);
  const since = sql`now() - (${window} || ' days')::interval`;

  const demo = await count(sql`
    select
      count(*)::int as visitors,
      coalesce(sum("count"), 0)::int as messages
    from "GuestUsage"
    where "key" like 'guest:%'
      and "count" > 0
      and "updatedAt" >= ${since}
  `);

  // The cohort: real accounts created in the window.
  const cohort = sql`
    select id from "User"
    where "createdAt" >= ${since}
      and "email" not like 'guest-%'
  `;

  const signups = await count(sql`
    select count(*)::int as total from (${cohort}) c
  `);

  // A connection is any saved integration in the account's workspace.
  const hasConnection = sql`(
       exists (select 1 from "OAuthConnection" x where x."organizationId" = m."organizationId")
    or exists (select 1 from "GoogleDriveConnection" x where x."organizationId" = m."organizationId")
    or exists (select 1 from "N8nConnection" x where x."organizationId" = m."organizationId")
    or exists (select 1 from "TikTokConnection" x where x."organizationId" = m."organizationId")
  )`;

  const connected = await count(sql`
    select count(distinct m."userId")::int as total
    from "OrganizationMember" m
    join (${cohort}) c on c.id = m."userId"
    where ${hasConnection}
  `);

  // Strict journey order: a success is counted only for accounts that also
  // connected, so every step is a subset of the one before it.
  const succeeded = await count(sql`
    select count(distinct m."userId")::int as total
    from "OrganizationMember" m
    join (${cohort}) c on c.id = m."userId"
    where ${hasConnection}
      and exists (
        select 1 from "AgentExecution" e
        where e."organizationId" = m."organizationId"::text
          and e."status" = 'succeeded'
      )
  `);

  const counts: JourneyCounts = {
    demoVisitors: asNumber(demo?.visitors),
    demoMessages: asNumber(demo?.messages),
    signups: asNumber(signups?.total),
    connected: asNumber(connected?.total),
    succeeded: asNumber(succeeded?.total),
  };

  return buildJourneyReport(window, counts);
}
