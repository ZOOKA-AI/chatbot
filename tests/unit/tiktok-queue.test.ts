import assert from "node:assert/strict";
import { test } from "vitest";
import { checkMediaUrl } from "@/lib/integrations/tiktok/media";
import {
  backoffMs,
  CLAIMABLE_STATUSES,
  reconciliationDecision,
  RECONCILE_STATUS,
  isClaimable,
  leaseExpiry,
  LEASE_MS,
  MAX_ATTEMPTS,
  nextAttemptFor,
  retryDecision,
} from "@/lib/integrations/tiktok/queue";

test("the media guard refuses everything that is not a public https URL", () => {
  for (const good of [
    "https://cdn.example.com/video.mp4",
    "https://media.base44.com/videos/public/x.mp4",
    "https://cdn.example.com:443/v.mp4",
  ]) {
    assert.equal(checkMediaUrl(good).ok, true, good);
  }
  const bad: Array<[string, string]> = [
    ["http://cdn.example.com/v.mp4", "https_required"],
    ["file:///etc/passwd", "https_required"],
    ["https://user:pass@cdn.example.com/v.mp4", "credentials_in_url"],
    ["https://cdn.example.com:8443/v.mp4", "port_not_allowed"],
    ["https://localhost/v.mp4", "internal_hostname"],
    ["https://intranet/v.mp4", "internal_hostname"],
    ["https://printer.local/v.mp4", "internal_hostname"],
    ["https://169.254.169.254/latest/meta-data", "private_address"],
    ["https://127.0.0.1/v.mp4", "private_address"],
    ["https://10.0.0.5/v.mp4", "private_address"],
    ["https://172.16.4.4/v.mp4", "private_address"],
    ["https://192.168.1.10/v.mp4", "private_address"],
    ["https://100.64.1.1/v.mp4", "private_address"],
    ["https://[::1]/v.mp4", "ip_literal_not_allowed"],
    ["not a url", "invalid_url"],
  ];
  for (const [url, problem] of bad) {
    const result = checkMediaUrl(url);
    assert.equal(result.ok, false, url);
    assert.equal(result.problem, problem, url);
  }
});

test("the lease expires and a job becomes claimable again", () => {
  const now = 1_700_000_000_000;
  assert.equal(leaseExpiry(now).getTime(), now - LEASE_MS);
  const fresh = { status: "CLAIMED", attempts: 1, claimedAt: new Date(now - 1000) };
  assert.equal(isClaimable(fresh, now), false);
  const stale = {
    status: "CLAIMED",
    attempts: 1,
    claimedAt: new Date(now - LEASE_MS - 1000),
  };
  assert.equal(isClaimable(stale, now), true);
});

test("a job stops being claimable at the attempt cap or when already uploaded", () => {
  const now = Date.now();
  assert.equal(
    isClaimable({ status: "PENDING", attempts: 0, claimedAt: null }, now),
    true
  );
  assert.equal(
    isClaimable({ status: "UPLOADED", attempts: 1, claimedAt: null }, now),
    false
  );
  assert.equal(
    isClaimable(
      { status: "FAILED", attempts: MAX_ATTEMPTS, claimedAt: new Date(now - LEASE_MS * 2) },
      now
    ),
    false,
    "a job that failed the maximum number of times must not be retried forever"
  );
  assert.equal(
    isClaimable(
      { status: "FAILED", attempts: MAX_ATTEMPTS - 1, claimedAt: new Date(now - LEASE_MS * 2) },
      now
    ),
    true
  );
});

test("retries back off exponentially and stop at the cap", () => {
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(2), 120_000);
  assert.equal(backoffMs(3), 240_000);
  assert.equal(backoffMs(4), 480_000);
  assert.equal(backoffMs(10), 30 * 60 * 1000, "never longer than the cap");
  assert.equal(backoffMs(0), 60_000, "a zero attempt still waits a minute");
});

test("a failure schedules a wait, and the last attempt dead-letters the job", () => {
  const now = 1_700_000_000_000;
  const first = retryDecision(1, now);
  assert.equal(first.status, "FAILED");
  assert.equal(first.nextAttemptAt?.getTime(), now + 60_000);

  const last = retryDecision(MAX_ATTEMPTS, now);
  assert.equal(last.status, "DEAD", "an unfixable job must stop retrying");
  assert.equal(last.nextAttemptAt, null, "a dead job is never rescheduled");

  const almost = retryDecision(MAX_ATTEMPTS - 1, now);
  assert.equal(almost.status, "FAILED", "the final attempt is still a retry");
  assert.equal(almost.nextAttemptAt?.getTime(), nextAttemptFor(MAX_ATTEMPTS - 1, now).getTime());
});

test("a held job can never be claimed as fresh work", () => {
  assert.ok(
    !(CLAIMABLE_STATUSES as readonly string[]).includes(RECONCILE_STATUS),
    "NEEDS_RECONCILIATION must stay outside the claimable set, or a runner re-uploads"
  );
});

test("an unknown publish result holds the job instead of retrying it", () => {
  const now = 1_700_000_000_000;
  const held = reconciliationDecision("unknown", 2, now);
  assert.equal(held.status, RECONCILE_STATUS);
  assert.equal(held.nextAttemptAt?.getTime(), now + 120_000, "recheck waits, it does not upload");
  assert.equal(reconciliationDecision("unknown", MAX_ATTEMPTS, now).status, RECONCILE_STATUS);
});

test("a settled publish closes the job with no second upload", () => {
  const settled = reconciliationDecision("settled", 3, 1_700_000_000_000);
  assert.equal(settled.status, "UPLOADED");
  assert.equal(settled.nextAttemptAt, null);
});

test("a publish TikTok reports as failed may be uploaded again, until the cap", () => {
  const now = 1_700_000_000_000;
  const retry = reconciliationDecision("failed", 1, now);
  assert.equal(retry.status, "PENDING", "a failed publish id cannot duplicate");
  assert.equal(retry.nextAttemptAt?.getTime(), now, "the fresh upload runs immediately");
  assert.equal(
    reconciliationDecision("failed", MAX_ATTEMPTS, now).status,
    "DEAD",
    "the attempt cap still applies to a fresh upload"
  );
});
