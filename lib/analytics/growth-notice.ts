import type { TrafficSnapshot } from "@/lib/analytics/growth";

/**
 * Turns a traffic snapshot into the one notice the growth page should show.
 *
 * Why this exists: `buildSnapshot` reports a GA4 failure as `reason` (the
 * snapshot itself is still `configured: true`), while the page used to render
 * only `error`. The result was a connected panel with a timestamp, no numbers
 * and no explanation. Keeping the decision here makes it testable without a
 * Next.js runtime.
 */
export type GrowthNotice = { tone: "failure" | "partial"; message: string };

export function growthNotice(traffic: TrafficSnapshot, ar: boolean): GrowthNotice | null {
  if (!traffic.configured) {
    // Not configured is a setup instruction, not a failure. The page owns that.
    return null;
  }

  if (!traffic.ga4) {
    const reason = traffic.reason?.trim();
    if (ar) {
      return {
        tone: "failure",
        message: reason
          ? `تعذّر جلب أرقام التحليلات: ${reason}`
          : "تعذّر جلب أرقام التحليلات. السبب غير متاح في هذه النسخة.",
      };
    }
    return {
      tone: "failure",
      message: reason
        ? `Analytics numbers could not be read: ${reason}`
        : "Analytics numbers could not be read. The reason is not available in this build.",
    };
  }

  if (traffic.error) {
    return {
      tone: "partial",
      message: ar
        ? `تعذّر جزء من البيانات: ${traffic.error}`
        : `Partial data unavailable: ${traffic.error}`,
    };
  }

  return null;
}
