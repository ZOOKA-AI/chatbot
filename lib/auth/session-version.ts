import { createHash } from "node:crypto";

/**
 * Ties a session to the password it was opened with, without a schema change.
 *
 * Sessions are stateless JWTs, so a password reset used to leave every other
 * device signed in: whoever had stolen a session kept it after the owner changed
 * the password. The token now carries a short digest of the stored password
 * hash. Any password change (reset, or a future "change password" screen)
 * produces a new bcrypt hash, the digest stops matching, and the session ends
 * on its next read.
 *
 * The digest is of the bcrypt hash, never the password, and is truncated: it can
 * only answer "is this still the same credential?". Keyed with AUTH_SECRET so a
 * leaked token reveals nothing comparable across deployments.
 */
export function credentialVersion(
  passwordHash: string | null | undefined
): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256")
    .update(`${secret}:${passwordHash ?? "no-password"}`)
    .digest("hex")
    .slice(0, 16);
}

export type SessionCheck =
  /** Token predates this check: stamp it, keep the session. */
  | { action: "stamp"; version: string }
  /** Same credential as when the session opened. */
  | { action: "keep" }
  /** Password changed or account gone: end the session. */
  | { action: "revoke"; reason: "password_changed" | "account_missing" };

/**
 * Pure decision so it can be tested without NextAuth or a database.
 *
 * `stored` undefined means the account row was not found.
 */
export function checkSessionVersion(
  tokenVersion: string | undefined,
  stored: { password: string | null } | undefined
): SessionCheck {
  if (!stored) {
    return { action: "revoke", reason: "account_missing" };
  }
  const current = credentialVersion(stored.password);
  if (!tokenVersion) {
    // Sessions issued before this shipped carry no version. Signing everyone
    // out on deploy would be worse than adopting them once.
    return { action: "stamp", version: current };
  }
  return tokenVersion === current
    ? { action: "keep" }
    : { action: "revoke", reason: "password_changed" };
}
