/**
 * Mail-specific limits.
 *
 * Reuses the project's sliding-window limiter rather than inventing a second
 * one, and keeps its stated caveat: the counters live in the process, so the
 * real ceiling is the limit multiplied by warm instances. That is enough to
 * turn an unlimited oracle into a bounded one, which is the point. A shared
 * store is the real fix and needs a credential nobody has provided.
 */

import { createThrottle } from "@/lib/auth/throttle";

export const MAIL_LIMITS = {
  /** Trying names: the enumeration surface. */
  availability: { limit: 20, windowMs: 60_000 },
  /** Successful or failed reservations per user. */
  reserve: { limit: 5, windowMs: 10 * 60_000 },
  /** AI calls cost money and time. */
  ai: { limit: 30, windowMs: 60_000 },
  /** Sending is the most consequential action in the product. */
  send: { limit: 10, windowMs: 60 * 60_000 },
} as const;

const throttles = {
  availability: createThrottle(MAIL_LIMITS.availability),
  reserve: createThrottle(MAIL_LIMITS.reserve),
  ai: createThrottle(MAIL_LIMITS.ai),
  send: createThrottle(MAIL_LIMITS.send),
};

export type MailLimitKind = keyof typeof throttles;

export type MailLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export function checkMailLimit(kind: MailLimitKind, key: string): MailLimitDecision {
  return throttles[kind].check(`${kind}:${key}`);
}

/** Test seam: clears one bucket so a suite can run without sleeping. */
export function resetMailLimit(kind: MailLimitKind, key: string): void {
  throttles[kind].reset(`${kind}:${key}`);
}
