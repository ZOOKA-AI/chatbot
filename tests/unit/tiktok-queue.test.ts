import assert from "node:assert/strict";
import { test } from "vitest";
import { checkMediaUrl } from "@/lib/integrations/tiktok/media";
import {
  isClaimable,
  leaseExpiry,
  LEASE_MS,
  MAX_ATTEMPTS,
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
