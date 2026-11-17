import "server-only";
import { sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/queries";

/**
 * Launch testing program.
 *
 * The first twenty genuinely registered accounts get every implemented feature
 * without a subscription and without prepaid credits, until the owner ends the
 * program. Two rules make this safe to run under load:
 *
 *   - allocation is a single INSERT ... SELECT against a table whose primary key
 *     is the slot number, so two concurrent registrations cannot receive the
 *     same slot and a user cannot claim twice;
 *   - a claim is only attempted after the account, organisation and membership
 *     exist, so a failed registration never burns a slot.
 *
 * The program is inert unless LAUNCH_TESTING_PROGRAM=on, and the owner ends it by
 * turning that switch off. Ending it never charges anybody, never changes a
 * Subscription row, and never deletes a claim or an account.
 */

export const LAUNCH_PROGRAM_SLOTS = 20;
export const LAUNCH_PROGRAM_FLAG = "LAUNCH_TESTING_PROGRAM";

const flagName = "LAUNCH_TESTING_PROGRAM";

export function isLaunchProgramOpen(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (env[flagName] ?? "").trim().toLowerCase() === "on";
}

/** Slots are counted, never displayed: the public UI must not expose the quota. */
export async function launchSlotsClaimed(): Promise<number> {
  const rows = (await adminDb().execute(
    sql`select count(*)::int as n from "LaunchTestingClaim"`
  )) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Claim the next free slot for a freshly registered account.
 * Returns the slot number, or null when the program is closed or full.
 * Never throws: a claim problem must not fail a registration.
 */
export async function claimLaunchSlot(userId: string): Promise<number | null> {
  if (!isLaunchProgramOpen()) return null;
  try {
    const rows = (await adminDb().execute(sql`
      insert into "LaunchTestingClaim" ("slot", "userId")
      select g."slot", ${userId}::uuid
      from generate_series(1, ${LAUNCH_PROGRAM_SLOTS}) as g("slot")
      where not exists (select 1 from "LaunchTestingClaim" c where c."slot" = g."slot")
        and not exists (select 1 from "LaunchTestingClaim" c where c."userId" = ${userId}::uuid)
      order by g."slot"
      limit 1
      on conflict do nothing
      returning "slot"
    `)) as unknown as { slot: number }[];
    return rows[0]?.slot ?? null;
  } catch {
    return null;
  }
}

export async function hasLaunchSlot(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const rows = (await adminDb().execute(
      sql`select 1 as ok from "LaunchTestingClaim" where "userId" = ${userId}::uuid limit 1`
    )) as unknown as { ok: number }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}
