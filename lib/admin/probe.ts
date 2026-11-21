import "server-only";

import type { AdminRow, AdminTable, Metric, MetricState } from "@/lib/admin/types";

/**
 * Every panel read is bounded. A query that never returns used to hang the whole
 * page (the overview did, reproducibly, until the renderer stopped responding),
 * because a pending promise is not an error and `probe` can only report what it
 * catches. Eight seconds is well above the slowest healthy aggregate and far
 * below the point where a reader gives up.
 */
const PROBE_TIMEOUT_MS = 8000;

function withTimeout<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`read timed out after ${PROBE_TIMEOUT_MS / 1000}s`)),
      PROBE_TIMEOUT_MS
    );
    run().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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
    const value = await withTimeout(run);
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
    const rows = await withTimeout(run);
    return { ...table, rows, state: rows.length > 0 ? "ok" : "empty" };
  } catch (error) {
    return { ...table, rows: [], state: stateOf(error), detail: messageOf(error) };
  }
}
