import assert from "node:assert/strict";
import { test } from "vitest";
import {
  isRateLimited,
  RATE_LIMIT_DEFAULT_MS,
  RATE_LIMIT_MAX_MS,
  RATE_LIMIT_MIN_MS,
  rateLimitDelayMs,
  retryDecision,
} from "@/lib/integrations/tiktok/queue";

/**
 * A 429 is a property of the account's quota, not of the video. These cases pin
 * the two ways that distinction can be lost: a delay taken from nowhere (blind
 * backoff) and a limit counted as a failed attempt (a video dead-lettered
 * without ever being tried).
 */

test("a numeric Retry-After is read as seconds, not milliseconds", () => {
  assert.equal(rateLimitDelayMs("30"), 30_000);
  assert.equal(rateLimitDelayMs("1"), 1_000);
});

test("an HTTP-date Retry-After is converted against the clock", () => {
  const now = Date.parse("2026-11-21T08:00:00Z");
  assert.equal(rateLimitDelayMs("Sat, 21 Nov 2026 08:00:45 GMT", now), 45_000);
});

test("absurd values are clamped instead of parking a job for a day", () => {
  assert.equal(rateLimitDelayMs("0"), RATE_LIMIT_MIN_MS);
  assert.equal(rateLimitDelayMs("999999"), RATE_LIMIT_MAX_MS);
  const now = Date.parse("2026-11-21T08:00:00Z");
  assert.equal(
    rateLimitDelayMs("Sat, 21 Nov 2026 20:00:00 GMT", now),
    RATE_LIMIT_MAX_MS
  );
});

test("a missing or unreadable header falls back to the default wait", () => {
  for (const value of [null, undefined, "", "   ", "soon", "-5"]) {
    assert.equal(rateLimitDelayMs(value), RATE_LIMIT_DEFAULT_MS, String(value));
  }
});

test("only the platform's own throttle is treated as a rate limit", () => {
  assert.equal(isRateLimited({ ok: false, error: "rate_limited" }), true);
  assert.equal(isRateLimited({ ok: false, error: "http_500" }), false);
  assert.equal(isRateLimited({ ok: false, error: "network_error" }), false);
  assert.equal(isRateLimited({ ok: true }), false);
});

test("a throttle is not the same decision as a failed upload", () => {
  // The retry ladder is what dead-letters a video at the cap. A 429 must never
  // reach it, which is why the drain route parks the job before this point.
  assert.equal(retryDecision(1, 0).status, "FAILED");
  assert.equal(retryDecision(5, 0).status, "DEAD");
  const firstRetry = retryDecision(1, 0);
  assert.ok(firstRetry.nextAttemptAt, "a first failure must schedule a retry");
  assert.notEqual(rateLimitDelayMs("30"), firstRetry.nextAttemptAt.getTime());
});
