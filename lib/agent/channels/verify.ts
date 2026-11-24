import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Telegram sends the value we registered with setWebhook in
 * `x-telegram-bot-api-secret-token`. With no configured secret the route must
 * fail closed rather than accept anonymous updates.
 */
export function verifyTelegramSecret(header: string | null, expected: string | null | undefined): boolean {
  if (!expected || expected.length < 16) {
    return false;
  }
  if (!header) {
    return false;
  }
  return safeEqual(header, expected);
}

export type SlackVerification = { ok: true } | { ok: false; reason: "not_configured" | "missing_headers" | "stale_timestamp" | "bad_signature" };

/**
 * Slack signs `v0:{timestamp}:{rawBody}` with the app signing secret. Requests
 * older than five minutes are rejected so a captured request cannot be replayed.
 */
export function verifySlackSignature(args: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string | null | undefined;
  nowSeconds?: number;
}): SlackVerification {
  const { rawBody, timestamp, signature, signingSecret } = args;
  if (!signingSecret || signingSecret.length < 16) {
    return { ok: false, reason: "not_configured" };
  }
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > 300) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
