import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { codeForUserId, referralLink } from "@/lib/growth/referrals";

describe("referral codes", () => {
  it("is deterministic for the same account", () => {
    const id = "39dda017-4692-422a-b062-fee3e9201b09";
    expect(codeForUserId(id)).toBe(codeForUserId(id));
  });

  it("produces eight characters from a URL-safe alphabet", () => {
    const code = codeForUserId("aad414a8-46a5-4d40-b83c-c569daca8b7c");
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[a-z2-9]+$/);
  });

  it("differs across accounts", () => {
    const ids = [
      "39dda017-4692-422a-b062-fee3e9201b09",
      "aad414a8-46a5-4d40-b83c-c569daca8b7c",
      "7c74572a-87be-4120-9a27-00a2c9604876",
      "52e2ae8f-3516-457e-9794-2e08ba05a9e5",
    ];
    const codes = new Set(ids.map(codeForUserId));
    expect(codes.size).toBe(ids.length);
  });
});

describe("referral links", () => {
  it("uses the production path shape", () => {
    expect(referralLink("abcd2345")).toBe("https://zooka-ai.com/r/abcd2345");
  });
});

describe("rewards cannot become money", () => {
  const src = readFileSync(join(process.cwd(), "lib/growth/referrals.ts"), "utf8");

  it("never writes to subscription or billing rows", () => {
    expect(src).not.toMatch(/INSERT\s+INTO\s+"Subscription"/i);
    expect(src).not.toMatch(/UPDATE\s+"Subscription"/i);
    expect(src).not.toMatch(/stripe/i);
  });

  it("never writes credits via the usage ledger", () => {
    expect(src).not.toMatch(/INSERT\s+INTO\s+"UsageEvent"/i);
  });
});
