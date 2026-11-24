import { describe, expect, it } from "vitest";
import { webQuotaRefusal } from "@/lib/saas/quota-messages";
import { getQuotaStatus } from "@/lib/saas/quota-utils";

// A free user asking for a web search was told "the monthly search credit
// ran out", which reads as a fault. The free plan has no searches at all.
describe("web quota refusal", () => {
  it("free plan: says not included and links to Pro, never 'ran out'", () => {
    const quota = getQuotaStatus("free", "web_search", 0);
    expect(quota.allowed).toBe(false);
    const refusal = webQuotaRefusal(quota, "search");
    expect(refusal.reason).toBe("not_in_plan");
    expect(refusal.upgradeUrl).toBe("/pricing");
    expect(refusal.error).toContain("غير متاح في الخطة المجانية");
    expect(refusal.error).toContain("Pro");
    expect(refusal.error).not.toMatch(/انتهى|استُهلك|رصيد/);
    expect(refusal.modelNote).toMatch(/not included/);
  });

  it("paid plan over its allowance: says used up and renews", () => {
    const quota = getQuotaStatus("pro", "web_search", 1000);
    expect(quota.allowed).toBe(false);
    const refusal = webQuotaRefusal(quota, "search");
    expect(refusal.reason).toBe("exhausted");
    expect(refusal.error).toContain("يتجدد");
  });

  it("read_url uses its own wording", () => {
    const refusal = webQuotaRefusal({ limit: 0 }, "read_url");
    expect(refusal.error).toContain("قراءة صفحات الويب");
  });
});
