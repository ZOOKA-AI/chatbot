import "server-only";

import type { AdminRow, AdminTable, Metric, MetricState } from "@/lib/admin/types";

/**
 * Runs one measurement and reports what happened instead of throwing.
 *
 * A missing table is `not_configured` (the migration has not been applied here), any other failure is
 * `error`. Both keep `value: null`: the distinction matters because one needs a migration and the
 * other needs a bug fixed, and a zero would hide both.
 */
export async function probe(
  key: string,
  labelAr: string,
  labelEn: string,
  source: string,
  run: () => Promise<number>
): Promise<Metric> {
  try {
    const value = await run();
    return {
      key,
      labelAr,
      labelEn,
      value,
      state: value > 0 ? "ok" : "empty",
      source,
    };
  } catch (error) {
    return {
      key,
      labelAr,
      labelEn,
      value: null,
      state: stateOf(error),
      source,
      detail: messageOf(error),
    };
  }
}

export function stateOf(error: unknown): MetricState {
  const message = messageOf(error) ?? "";
  return /does not exist|undefined table|undefined column|relation .* does not exist/i.test(message)
    ? "not_configured"
    : "error";
}

export function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message.slice(0, 160);
  if (typeof error === "string") return error.slice(0, 160);
  return null;
}

export async function probeRows(
  table: Omit<AdminTable, "state" | "detail" | "rows">,
  run: () => Promise<AdminRow[]>
): Promise<AdminTable> {
  try {
    const rows = await run();
    return { ...table, rows, state: rows.length > 0 ? "ok" : "empty" };
  } catch (error) {
    return { ...table, rows: [], state: stateOf(error), detail: messageOf(error) };
  }
}
