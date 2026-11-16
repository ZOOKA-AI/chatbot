import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkDomain, checkDomains } from "@/lib/agents/domain-check";

/**
 * The states are the point. A checker that answers "available" when it could not reach the
 * registry is worse than one that fails: a customer acts on it.
 */

const response = (status: number) => ({ status }) as Response;

describe("answers come from the registry first", () => {
  test("200 means registered", async () => {
    const result = await checkDomain("zooka-ai.com", { fetchImpl: (async () => response(200)) as typeof fetch });
    assert.equal(result.status, "taken");
    assert.equal(result.source, "rdap");
  });

  test("404 means registrable", async () => {
    const result = await checkDomain("definitely-not-registered-example-xyz.com", {
      fetchImpl: (async () => response(404)) as typeof fetch,
    });
    assert.equal(result.status, "available");
    assert.equal(result.source, "rdap");
  });

  test("a rate-limited registry falls through to the next source rather than guessing", async () => {
    const result = await checkDomain("example.com", {
      fetchImpl: (async () => response(429)) as typeof fetch,
      dnsLookup: async () => {
        throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
      },
    });
    assert.equal(result.status, "available");
    assert.equal(result.source, "dns");
  });
});

describe("DNS is a second opinion, and is labelled as such", () => {
  test("records present means taken", async () => {
    const result = await checkDomain("example.com", {
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as typeof fetch,
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    assert.equal(result.status, "taken");
    assert.equal(result.source, "dns");
  });

  test("both sources failing is unknown, never available", async () => {
    const result = await checkDomain("example.com", {
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as typeof fetch,
      dnsLookup: async () => {
        throw Object.assign(new Error("resolver failure"), { code: "ESERVFAIL" });
      },
    });
    assert.equal(result.status, "unknown");
    assert.notEqual(result.status, "available");
  });

  test("a malformed name is refused instead of sent", async () => {
    const result = await checkDomain("not a domain", { fetchImpl: (async () => response(200)) as typeof fetch });
    assert.equal(result.status, "unknown");
    assert.equal(result.detail, "malformed_domain");
  });
});

test("one failure does not hide the others", async () => {
  const calls: string[] = [];
  const results = await checkDomains(["a.com", "b.com", "c.com"], {
    fetchImpl: (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("b.com")) return response(200);
      return response(404);
    }) as unknown as typeof fetch,
  });
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.status), ["available", "taken", "available"]);
  assert.ok(calls.length >= 3);
});
