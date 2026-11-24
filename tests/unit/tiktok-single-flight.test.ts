import assert from "node:assert/strict";
import { test } from "vitest";
import {
  inFlightCount,
  runExclusive,
} from "@/lib/integrations/tiktok/single-flight";

test("parallel callers share one refresh instead of spending the token twice", async () => {
  assert.equal(inFlightCount(), 0);
  let calls = 0;
  const work = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return `token-${calls}`;
  };
  const results = await Promise.all([
    runExclusive("org:user", work),
    runExclusive("org:user", work),
    runExclusive("org:user", work),
    runExclusive("org:user", work),
    runExclusive("org:user", work),
  ]);
  assert.equal(calls, 1, "one refresh, five callers");
  assert.deepEqual(new Set(results), new Set(["token-1"]));
  assert.equal(inFlightCount(), 0, "the slot is released when it settles");
});

test("a different creator is not blocked by another creator's refresh", async () => {
  let calls = 0;
  const work = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return calls;
  };
  await Promise.all([
    runExclusive("org-a:user", work),
    runExclusive("org-b:user", work),
  ]);
  assert.equal(calls, 2, "separate keys run separately");
});

test("a failed refresh is retryable, not cached", async () => {
  await assert.rejects(
    runExclusive("org:user", async () => {
      throw new Error("invalid_grant");
    }),
    /invalid_grant/
  );
  assert.equal(inFlightCount(), 0);
  const second = await runExclusive("org:user", async () => "recovered");
  assert.equal(second, "recovered");
});

test("a later call after a settled refresh starts fresh", async () => {
  const first = await runExclusive("k", async () => "one");
  const second = await runExclusive("k", async () => "two");
  assert.equal(first, "one");
  assert.equal(second, "two");
});
