import { describe, expect, it } from "vitest";

import {
  INVITE_DAILY_CAP,
  hashAddress,
  inviteBody,
  inviteSubject,
  isDeliverableAddress,
  normalizeAddress,
  remainingToday,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/growth/invites";

describe("invitation addresses", () => {
  it("normalises case and surrounding space so one person is one row", () => {
    expect(normalizeAddress("  Someone@Example.COM ")).toBe("someone@example.com");
    expect(hashAddress(" Someone@Example.COM ")).toBe(hashAddress("someone@example.com"));
  });

  it("refuses addresses that cannot be delivered", () => {
    for (const bad of ["", "no-at-sign", "a@b", "two@@dots.com", "sp ace@x.com", "x".repeat(250) + "@y.com"]) {
      expect(isDeliverableAddress(bad)).toBe(false);
    }
    expect(isDeliverableAddress("owner@zooka-ai.com")).toBe(true);
  });

  it("stores only a keyed hash that does not contain the address", () => {
    const hash = hashAddress("owner@zooka-ai.com");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("owner");
    expect(hash).not.toContain("@");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips for the same address and rejects a different one", () => {
    const token = unsubscribeToken("owner@zooka-ai.com");
    expect(verifyUnsubscribeToken("owner@zooka-ai.com", token)).toBe(true);
    expect(verifyUnsubscribeToken("other@zooka-ai.com", token)).toBe(false);
    expect(verifyUnsubscribeToken("owner@zooka-ai.com", "x" + token)).toBe(false);
  });
});

describe("daily cap", () => {
  it("counts down and never goes negative", () => {
    expect(remainingToday(0)).toBe(INVITE_DAILY_CAP);
    expect(remainingToday(3)).toBe(INVITE_DAILY_CAP - 3);
    expect(remainingToday(INVITE_DAILY_CAP)).toBe(0);
    expect(remainingToday(INVITE_DAILY_CAP + 5)).toBe(0);
    expect(remainingToday(-2)).toBe(INVITE_DAILY_CAP);
  });
});

describe("invitation copy", () => {
  const base = {
    inviterName: "helmy",
    referrerCode: "ABC23456",
    baseUrl: "https://chatbot-clean-git-release-clean-acceptance-zooka-ai1.vercel.app",
    unsubscribeToken: "t0ken",
    recipient: "friend@example.com",
  };

  it("carries the referral link and the unsubscribe link in both languages", () => {
    for (const lang of ["ar", "en"] as const) {
      const html = inviteBody({ ...base, lang, personalNote: null });
      expect(html).toContain(`${base.baseUrl}/r/${base.referrerCode}`);
      expect(html).toContain("/api/growth/unsubscribe?");
      expect(html).toContain(`t=${base.unsubscribeToken}`);
      expect(html).toContain(lang === "ar" ? 'dir="rtl"' : 'dir="ltr"');
    }
    expect(inviteSubject("ar", "helmy")).toContain("helmy");
    expect(inviteSubject("en", "helmy")).toContain("helmy");
  });

  it("escapes the personal note so an invite cannot carry markup", () => {
    const html = inviteBody({ ...base, lang: "en", personalNote: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
