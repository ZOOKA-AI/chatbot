import type { FunnelReport, FunnelRow } from "@/lib/growth/funnel";

/**
 * The shape the n8n Growth Engine reads. Counts and ratios only: no user id,
 * no address, no name. Ratios are null when the denominator is zero so a
 * workflow never mistakes "no data" for "0% conversion".
 */
export interface GrowthChannelReport extends FunnelRow {
  activationRate: number | null;
  retention7dRate: number | null;
}

export interface GrowthReport {
  days: number;
  generatedAt: string;
  channels: GrowthChannelReport[];
  totals: FunnelReport["totals"] & {
    activationRate: number | null;
    retention7dRate: number | null;
  };
  /** Channel with the most activated users, ignoring "unknown". Null when none. */
  bestChannel: string | null;
  /** What the report cannot tell, so a summary never overstates it. */
  notMeasured: string[];
}

function ratio(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 1000;
}

export const NOT_MEASURED = [
  "reach (needs each platform's insights API)",
  "website visits (Vercel Analytics is not exposed to the API)",
  "cost per signup (needs a ZOOKA-AI ad account, separate from Royal Haroon)",
];

export function buildGrowthReport(funnel: FunnelReport, now = new Date()): GrowthReport {
  const channels = funnel.rows.map((row) => ({
    ...row,
    activationRate: ratio(row.activated, row.signups),
    retention7dRate: ratio(row.activeLast7d, row.signups),
  }));

  const best = channels
    .filter((row) => row.source !== "unknown" && row.activated > 0)
    .sort((a, b) => b.activated - a.activated || b.signups - a.signups)[0];

  return {
    days: funnel.days,
    generatedAt: now.toISOString(),
    channels,
    totals: {
      ...funnel.totals,
      activationRate: ratio(funnel.totals.activated, funnel.totals.signups),
      retention7dRate: ratio(funnel.totals.activeLast7d, funnel.totals.signups),
    },
    bestChannel: best?.source ?? null,
    notMeasured: NOT_MEASURED,
  };
}

/** Accepts a missing body, `{}` or `{ "days": 1..365 }`. Anything else is null (400). */
export function parseReportDays(body: unknown): number | null {
  if (body === null || body === undefined) return 30;
  if (typeof body !== "object" || Array.isArray(body)) return null;
  const days = (body as Record<string, unknown>).days;
  if (days === undefined) return 30;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365) {
    return null;
  }
  return days;
}
