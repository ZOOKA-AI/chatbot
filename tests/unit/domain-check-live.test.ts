import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkDomain } from "@/lib/agents/domain-check";

/**
 * Real registries, read-only, no credentials and no cost.
 *
 * Opt-in because it needs egress to the registry: run with ZOOKA_TEST_DOMAIN_LIVE=1. A
 * skipped network test is honest; a mocked one that is claimed as proof is not.
 */

const live = process.env.ZOOKA_TEST_DOMAIN_LIVE === "1";

describe.skipIf(!live)("live registry answers", () => {
  test("a domain this project already owns reads as taken", async () => {
    const result = await checkDomain("zooka-ai.com");
    assert.equal(result.status, "taken", JSON.stringify(result));
  }, 30_000);

  test("a name nobody holds reads as available", async () => {
    const probe = `zooka-launch-probe-${Date.now()}.com`;
    const result = await checkDomain(probe);
    // Either a registry answer or an honest unknown; never a false "taken".
    assert.ok(["available", "unknown"].includes(result.status), JSON.stringify(result));
  }, 30_000);
});
