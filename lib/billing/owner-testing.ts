/**
 * Owner testing access.
 *
 * The owner can name the accounts that test every implemented feature without
 * a subscription, by listing their email addresses in OWNER_TESTING_EMAILS
 * (comma, semicolon or whitespace separated). The list lives only in the
 * deployment environment, so no address is committed to the repository and an
 * empty or missing variable turns the feature off.
 *
 * It grants plan features only: usage is still metered and recorded, no
 * Subscription row is read for the decision or written, and no admin or
 * database privilege is granted.
 */

export const OWNER_TESTING_FLAG = "OWNER_TESTING_EMAILS";

export function ownerTestingEmails(
  env: Record<string, string | undefined> = process.env
): Set<string> {
  const raw = env.OWNER_TESTING_EMAILS ?? "";
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.includes("@"))
  );
}

export function isOwnerTestingEmail(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!email) {
    return false;
  }
  return ownerTestingEmails(env).has(email.trim().toLowerCase());
}
