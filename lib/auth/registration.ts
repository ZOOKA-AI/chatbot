import { createHash, randomBytes } from "node:crypto";

/**
 * Registration outcomes, and the rules that keep them neutral.
 *
 * The old flow told the caller "Account already exists!" for a known address and
 * signed them in for a new one: two different answers, so anyone could test
 * whether an address has an account. Everything below exists to make the two
 * branches indistinguishable, in wording, in timing, and in what the caller can
 * observe afterwards.
 */

/** One answer for every successful submission, whatever the branch. */
export const NEUTRAL_SIGNUP_STATUS = "check_email" as const;

export type RegistrationPlan = {
  /** What the caller is told. Identical in both branches. */
  status: typeof NEUTRAL_SIGNUP_STATUS;
  /** Create the account. False when the address is already registered. */
  createAccount: boolean;
  /** Send the "welcome, verify your address" mail. */
  sendVerification: boolean;
  /** Send the "someone tried to sign up with your address" notice. */
  sendExistingAccountNotice: boolean;
  /**
   * Burn the same CPU as a real password hash. Without this, a registered
   * address answers in microseconds and a new one takes ~100ms, which is an
   * oracle even when the wording is identical.
   */
  equalizeWork: boolean;
};

export function planRegistration(state: {
  existing: boolean;
  createFailedOnConflict?: boolean;
}): RegistrationPlan {
  if (state.existing || state.createFailedOnConflict) {
    return {
      status: NEUTRAL_SIGNUP_STATUS,
      createAccount: false,
      sendVerification: false,
      sendExistingAccountNotice: true,
      equalizeWork: true,
    };
  }
  return {
    status: NEUTRAL_SIGNUP_STATUS,
    createAccount: true,
    sendVerification: true,
    sendExistingAccountNotice: false,
    equalizeWork: false,
  };
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** 32 random bytes, handed out once, stored only as a SHA-256 digest. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export const TOKEN_TTL = {
  verificationMs: 24 * 60 * 60 * 1000,
  resetMs: 30 * 60 * 1000,
} as const;

/** True when the token is well shaped and still inside its window. */
export function tokenIsUsable(row: { usedAt: Date | null; expiresAt: Date } | null | undefined, now = Date.now()) {
  if (!row) return false;
  if (row.usedAt) return false;
  return row.expiresAt.getTime() > now;
}
