import { and, eq, gt, isNull } from "drizzle-orm";

import { emailVerificationToken, passwordResetToken, user } from "@/lib/db/schema";
import { hashToken, isTokenShape, newToken, TOKEN_TTL } from "@/lib/auth/registration";

/**
 * Email-verification tokens: issued once, stored only as a digest, single use,
 * and consumed by one conditional UPDATE so two concurrent clicks cannot both
 * succeed.
 *
 * The database handle is injected (defaulting to the app's) so the real SQL can
 * be exercised against a real PostgreSQL engine in tests instead of a mock.
 */

/**
 * A database handle. Kept deliberately loose: the app passes its node-postgres
 * Drizzle client, tests pass a PGlite one, and both are structurally different
 * at the type level while running the same SQL.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function defaultDb(): AnyDb {
  // Required lazily so importing this module never opens a connection.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/lib/db/queries").db as AnyDb;
}

export type IssueResult = { token: string; hash: string; expiresAt: Date };

export async function issueVerificationToken(
  userId: string,
  options: { db?: AnyDb; now?: number } = {}
): Promise<IssueResult> {
  const db = options.db ?? defaultDb();
  const { token, hash } = newToken();
  const expiresAt = new Date((options.now ?? Date.now()) + TOKEN_TTL.verificationMs);

  await db.insert(emailVerificationToken).values({ tokenHash: hash, userId, expiresAt });
  return { token, hash, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "bad_shape" | "unknown_or_used" };

export async function consumeVerificationToken(
  rawToken: string,
  options: { db?: AnyDb; now?: number } = {}
): Promise<ConsumeResult> {
  if (!isTokenShape(rawToken)) {
    return { ok: false, reason: "bad_shape" };
  }
  const db = options.db ?? defaultDb();
  const at = new Date(options.now ?? Date.now());

  const rows = await db
    .update(emailVerificationToken)
    .set({ usedAt: at })
    .where(
      and(
        eq(emailVerificationToken.tokenHash, hashToken(rawToken)),
        isNull(emailVerificationToken.usedAt),
        gt(emailVerificationToken.expiresAt, at)
      )
    )
    .returning({ userId: emailVerificationToken.userId });

  const row = (rows as Array<{ userId: string }>)[0];
  return row ? { ok: true, userId: row.userId } : { ok: false, reason: "unknown_or_used" };
}

export async function markEmailVerified(
  userId: string,
  options: { db?: AnyDb; now?: number } = {}
) {
  const db = options.db ?? defaultDb();
  await db
    .update(user)
    .set({ emailVerifiedAt: new Date(options.now ?? Date.now()) })
    .where(eq(user.id, userId));
}

/**
 * The same single-use claim, for password reset tokens.
 *
 * It lives here so the reset path in lib/db/queries.ts runs exactly the SQL
 * these tests exercise, instead of a copy of it.
 */
export async function claimPasswordResetToken(
  tokenHash: string,
  options: { db?: AnyDb; now?: number } = {}
): Promise<string | null> {
  const db = options.db ?? defaultDb();
  const at = new Date(options.now ?? Date.now());

  const rows = await db
    .update(passwordResetToken)
    .set({ usedAt: at })
    .where(
      and(
        eq(passwordResetToken.tokenHash, tokenHash),
        isNull(passwordResetToken.usedAt),
        gt(passwordResetToken.expiresAt, at)
      )
    )
    .returning({ userId: passwordResetToken.userId });

  const row = (rows as Array<{ userId: string }>)[0];
  return row?.userId ?? null;
}
