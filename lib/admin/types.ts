/**
 * The vocabulary of the admin command center.
 *
 * One rule decides every shape here: a number is only shown when a real source produced it. A metric
 * whose table is missing, whose provider is unconfigured, or whose read failed carries `value: null`
 * and a state that says which of those it is, so the screen never renders an invented zero and never
 * turns "we did not measure" into "all clear".
 */
export type MetricState = "ok" | "empty" | "not_configured" | "error";

export type Metric = {
  key: string;
  labelAr: string;
  labelEn: string;
  value: number | null;
  state: MetricState;
  /** Where the number came from, in words a human can check. */
  source: string;
  detail?: string | null;
};

export type AdminRow = Record<string, string | number | null>;

export type AdminColumn = { key: string; labelAr: string; labelEn: string };

export type AdminTable = {
  key: string;
  titleAr: string;
  titleEn: string;
  columns: AdminColumn[];
  rows: AdminRow[];
  state: MetricState;
  detail?: string | null;
};

export type AdminSection = {
  metrics: Metric[];
  tables: AdminTable[];
};
