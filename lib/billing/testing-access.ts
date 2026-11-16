/**
 * Owner testing access.
 *
 * Seven explicitly authorized addresses may exercise every implemented feature
 * without buying a subscription and without spending prepaid credits. The grant
 * is deliberately narrow and boring:
 *
 *   - it is an allowlist of email addresses, not a role and not a plan;
 *   - it changes nothing in the database (Subscription rows stay untouched);
 *   - it is inert unless the deployment sets UNLIMITED_TESTING_MODE=on, so a
 *     forgotten commit can never hand out free usage by accident;
 *   - it grants product features only. It does not grant administrator rights,
 *     database privileges, or the ability to act outside the tenant.
 *
 * Usage is still metered: callers keep writing UsageEvent rows so real
 * infrastructure cost stays visible while the customer-facing limit is waived.
 */

export const OWNER_TESTING_EMAILS = [
  "helmyharoon8@gmail.com",
  "zookaalmrzwq@gmail.com",
  "royalalemirates20199@gmail.com",
  "goldencompany724@gmail.com",
  "hzaam391@gmail.com",
  "rwyalamarat@gmail.com",
  "info@royalcleanuae.com",
] as const;

export const UNLIMITED_TESTING_FLAG = "UNLIMITED_TESTING_MODE";

const allowlist = new Set<string>(OWNER_TESTING_EMAILS.map((value) => value.trim().toLowerCase()));

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Whether this address is on the owner's testing allowlist. Says nothing about the deployment flag. */
export function isTestingAccessEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && allowlist.has(normalized);
}

/** The deployment switch. Anything other than "on" means off. */
export function isUnlimitedTestingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return normalizeEmail(env[UNLIMITED_TESTING_FLAG]) === "on";
}

/** Both conditions must hold: allowlisted address and an enabled deployment switch. */
export function hasUnlimitedTestingAccess(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return isTestingAccessEmail(email) && isUnlimitedTestingEnabled(env);
}

/**
 * Agent runs are capped in `app/api/agent/route.ts`. Returning `true` here means
 * the monthly cap is waived for this request. Metering is unaffected.
 */
export function isAgentRunLimitExempt(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return hasUnlimitedTestingAccess(email, env);
}

/** Human-readable reason used by the admin panel and by the agent console badge. */
export function testingAccessLabel(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): "unlimited" | "standard" {
  return hasUnlimitedTestingAccess(email, env) ? "unlimited" : "standard";
}
