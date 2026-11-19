import { describe, expect, test } from "vitest";

import type { TrafficSnapshot } from "@/lib/analytics/growth";
import { safeFailureReason } from "@/lib/analytics/growth";
import { growthNotice } from "@/lib/analytics/growth-notice";

/*
 * Regression cover for a defect seen in production on 2026-11-18: the growth
 * page reported `configured: true` with a fresh timestamp, then rendered no
 * numbers and no explanation, because `buildSnapshot` puts a GA4 failure in
 * `reason` while the page only rendered `error`.
 */

const base = (overrides: Partial<TrafficSnapshot>): TrafficSnapshot =>
  ({ configured: true, ...overrides }) as TrafficSnapshot;

describe("growthNotice", () => {
  test("not configured is the page's setup notice, not a failure", () => {
    expect(growthNotice(base({ configured: false, reason: "missing_property_id" }), true)).toBeNull();
  });

  test("a GA4 failure surfaces the real reason instead of an empty panel", () => {
    const notice = growthNotice(
      base({ reason: "SERVICE_DISABLED: Google Analytics Data API has not been used in project 558007276278" }),
      false
    );
    expect(notice?.tone).toBe("failure");
    expect(notice?.message).toContain("SERVICE_DISABLED");
    expect(notice?.message).toContain("Analytics numbers could not be read");
  });

  test("the Arabic notice carries the same reason", () => {
    const notice = growthNotice(base({ reason: "PERMISSION_DENIED" }), true);
    expect(notice?.message).toContain("PERMISSION_DENIED");
    expect(notice?.message).toContain("تعذّر جلب أرقام التحليلات");
  });

  test("a missing reason still explains the failure", () => {
    const notice = growthNotice(base({}), false);
    expect(notice?.tone).toBe("failure");
    expect(notice?.message).toMatch(/reason is not available/i);
  });

  test("GA4 present with a Search Console failure stays partial, not fatal", () => {
    const notice = growthNotice(
      base({
        ga4: { sessions: 97, users: 31, views: 343, channels: [], pages: [] },
        error: "gsc_query_failed",
      }),
      false
    );
    expect(notice?.tone).toBe("partial");
    expect(notice?.message).toContain("gsc_query_failed");
  });

  test("a healthy snapshot shows no notice at all", () => {
    expect(
      growthNotice(base({ ga4: { sessions: 1, users: 1, views: 1, channels: [], pages: [] } }), false)
    ).toBeNull();
  });
});

describe("safeFailureReason", () => {
  test("keeps the useful part of a Google error", () => {
    expect(safeFailureReason(new Error("403 PERMISSION_DENIED"))).toBe("403 PERMISSION_DENIED");
  });

  test("strips bearer tokens and key value pairs", () => {
    const text = safeFailureReason(
      new Error("failed with Bearer ya29.a0AfH6SMCsecret access_token=ya29.abc&key=AIzaSyTOPSECRET")
    );
    expect(text).not.toContain("a0AfH6SMCsecret");
    expect(text).not.toContain("AIzaSyTOPSECRET");
    expect(text).toContain("[redacted]");
  });

  test("redacts something that looks like a JWT", () => {
    const text = safeFailureReason(new Error("token eyJhbGciOi.eyJzdWIiOi.sigpart rejected"));
    expect(text).not.toContain("eyJhbGciOi");
    expect(text).toContain("[redacted-jwt]");
  });

  test("is one line and bounded", () => {
    const text = safeFailureReason(new Error(`a\n${"x".repeat(500)}`));
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThanOrEqual(203);
  });

  test("falls back when there is nothing to show", () => {
    expect(safeFailureReason(new Error("   "), "gsc_query_failed")).toBe("gsc_query_failed");
    expect(safeFailureReason(undefined)).toBe("traffic_snapshot_failed");
  });
});
