import { describe, expect, it } from "vitest";

import {
  MAX_ADDRESSES_PER_ORGANIZATION,
  MAX_ADDRESSES_PER_USER,
  reserveMailAddress,
} from "@/lib/mail/reserve";
import { createFakeRepo } from "./mail-fixtures";

const base = { organizationId: "org-a", userId: "user-1" };

describe("address reservation", () => {
  it("reserves a free name", async () => {
    const { repo } = createFakeRepo();
    const result = await reserveMailAddress({ repo, ...base, localPart: "helmy" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.address).toBe("helmy@zooka-ai.com");
  });

  it("refuses a duplicate without saying who owns it", async () => {
    const { repo } = createFakeRepo();
    await reserveMailAddress({ repo, ...base, localPart: "helmy" });
    const second = await reserveMailAddress({ repo, organizationId: "org-b", userId: "user-9", localPart: "helmy" });
    expect(second).toEqual({ ok: false, reason: "taken" });
    expect(Object.keys(second)).toEqual(["ok", "reason"]);
  });

  it("lets exactly one of 25 simultaneous reservations win", async () => {
    const { repo, addresses } = createFakeRepo();
    const attempts = Array.from({ length: 25 }, (_, index) =>
      reserveMailAddress({
        repo,
        organizationId: "org-a",
        userId: `user-${index}`,
        localPart: "contested",
      })
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "taken")).toHaveLength(24);
    expect(addresses.size).toBe(1);
  });

  it("is case insensitive at the database boundary, not just in the input", async () => {
    const { repo, addresses } = createFakeRepo();
    await reserveMailAddress({ repo, ...base, localPart: "Helmy" });
    const second = await reserveMailAddress({ repo, ...base, localPart: "helmy" });
    expect(second).toEqual({ ok: false, reason: "taken" });
    expect(addresses.size).toBe(1);
  });

  it("enforces the per-user and per-organization quota", async () => {
    const { repo } = createFakeRepo();
    for (let index = 0; index < MAX_ADDRESSES_PER_USER; index += 1) {
      const result = await reserveMailAddress({ repo, ...base, localPart: `name${index}` });
      expect(result.ok).toBe(true);
    }
    const overUser = await reserveMailAddress({ repo, ...base, localPart: "onemore" });
    expect(overUser).toEqual({ ok: false, reason: "quota", detail: "user" });

    // A second member of the same workspace can still reserve, up to the org cap.
    for (let index = MAX_ADDRESSES_PER_USER; index < MAX_ADDRESSES_PER_ORGANIZATION; index += 1) {
      const result = await reserveMailAddress({
        repo,
        organizationId: "org-a",
        userId: "user-2",
        localPart: `shared${index}`,
      });
      expect(result.ok).toBe(true);
    }
    const overOrg = await reserveMailAddress({
      repo,
      organizationId: "org-a",
      userId: "user-2",
      localPart: "final",
    });
    expect(overOrg).toEqual({ ok: false, reason: "quota", detail: "organization" });
  });

  it("keeps the quota per organization, not global", async () => {
    const { repo } = createFakeRepo();
    for (let index = 0; index < MAX_ADDRESSES_PER_USER; index += 1) {
      await reserveMailAddress({ repo, ...base, localPart: `name${index}` });
    }
    const other = await reserveMailAddress({ repo, organizationId: "org-b", userId: "user-9", localPart: "another" });
    expect(other.ok).toBe(true);
  });

  it("refuses reserved and invalid names before touching the store", async () => {
    const { repo, addresses } = createFakeRepo();
    expect(await reserveMailAddress({ repo, ...base, localPart: "admin" })).toEqual({
      ok: false,
      reason: "reserved",
    });
    const invalid = await reserveMailAddress({ repo, ...base, localPart: "ab" });
    expect(invalid).toEqual({ ok: false, reason: "invalid", detail: "too_short" });
    expect(addresses.size).toBe(0);
  });
});
