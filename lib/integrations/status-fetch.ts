/**
 * One place where a status card asks the server what it knows.
 *
 * The bug this exists for: three cards sat on "Checking…" indefinitely while the endpoint answered
 * 200 for other surfaces. A fetch that never settles (a saturated pool, a proxy that holds the
 * connection, a hung tenant transaction) has no error branch, so the component keeps rendering its
 * loading state forever and no retry is ever offered. A waited-on promise is not a measurement.
 *
 * So every status read is bounded. A timeout is returned as a distinct outcome, which the caller
 * renders as "could not read the status, retry" rather than as an eternal spinner.
 */

export type StatusOutcome<T> =
  | { ok: true; status: T }
  | { ok: false; reason: "timeout" | "http" | "network" | "shape" };

export async function loadIntegrationStatus<T>(
  provider: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<StatusOutcome<T>> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  // AbortSignal.timeout cannot be combined with an outer signal without a controller, and the outer
  // one matters when the panel is closed mid-request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onOuterAbort = () => controller.abort(new Error("cancelled"));
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const response = await doFetch(`/api/integrations/${provider}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "http" };
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object") return { ok: false, reason: "shape" };
    return { ok: true, status: body as T };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
