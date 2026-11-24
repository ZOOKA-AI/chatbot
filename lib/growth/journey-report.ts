/**
 * The four-step product journey, as plain numbers:
 *
 *   demo -> signup -> first connection -> first successful agent action
 *
 * Pure shaping only (no database), so the rules are unit-tested. The queries
 * live in `journey.ts`.
 *
 * The demo is anonymous, so it cannot be joined to a person: it is reported
 * as top-of-funnel volume, and the demo-to-signup ratio is a ratio of two
 * counts in the same window, not a tracked conversion. The three account steps
 * are a true cohort: every count is out of the accounts that signed up in the
 * window. A step that could not be read is null, never zero.
 */
export interface JourneyCounts {
  demoVisitors: number | null;
  demoMessages: number | null;
  signups: number | null;
  connected: number | null;
  succeeded: number | null;
}

export interface JourneyStep {
  key: "demo" | "signup" | "connection" | "success";
  count: number | null;
  /** Share of the previous step. Null when either side is unknown or zero. */
  fromPrevious: number | null;
}

export interface JourneyReport {
  days: number;
  steps: JourneyStep[];
  demoMessages: number | null;
  /** The step where the largest share of people stopped. Null when unknown. */
  biggestDrop: JourneyStep["key"] | null;
  notes: string[];
}

export const JOURNEY_NOTES = [
  "The demo is anonymous: demo-to-signup compares two counts, it does not follow a person.",
  "A demo visitor is one browser per day (the existing daily demo quota row), not a unique person.",
  "Signups, connections and successes are the same cohort: accounts created in the window.",
  "A connection is any saved integration (OAuth, Google Drive, n8n, TikTok) in the account's workspace.",
  "A success is an agent execution that finished with status 'succeeded', counted only for accounts that also connected, so each step is a subset of the one before.",
];

function share(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) {
    return null;
  }
  return Math.round((part / whole) * 1000) / 1000;
}

export function buildJourneyReport(
  days: number,
  counts: JourneyCounts
): JourneyReport {
  const steps: JourneyStep[] = [
    { key: "demo", count: counts.demoVisitors, fromPrevious: null },
    {
      key: "signup",
      count: counts.signups,
      fromPrevious: share(counts.signups, counts.demoVisitors),
    },
    {
      key: "connection",
      count: counts.connected,
      fromPrevious: share(counts.connected, counts.signups),
    },
    {
      key: "success",
      count: counts.succeeded,
      fromPrevious: share(counts.succeeded, counts.connected),
    },
  ];

  // Only the account steps are a real cohort, so only they can name the
  // biggest drop; the demo ratio is not a conversion.
  const cohort = steps
    .slice(2)
    .filter((step): step is JourneyStep & { fromPrevious: number } =>
      step.fromPrevious !== null
    );
  const worst = cohort.sort((a, b) => a.fromPrevious - b.fromPrevious)[0];

  return {
    days,
    steps,
    demoMessages: counts.demoMessages,
    biggestDrop: worst && worst.fromPrevious < 1 ? worst.key : null,
    notes: JOURNEY_NOTES,
  };
}
