import "server-only";

/**
 * fal.ai Model API, as documented.
 *
 * Paths and semantics come from https://fal.ai/docs/documentation/model-apis/queue:
 *
 *   POST https://queue.fal.run/{owner}/{app}[/{path}]        submit, returns request_id + urls
 *   GET  .../requests/{request_id}/status?logs=1             IN_QUEUE | IN_PROGRESS | COMPLETED
 *   GET  .../requests/{request_id}                           the result
 *   POST .../requests/{request_id}/cancel                    cancel
 *
 * Two documented details are easy to get wrong and are handled here explicitly:
 *
 * 1. The status, result and cancel URLs use only owner and app, never the full model path. A URL with
 *    the endpoint path returns 405, so the client always uses the URLs the submit response returned.
 * 2. fal retries a failed runner itself (up to 10 requeues). That means a timeout or a dropped
 *    connection is not proof of failure, which is exactly why this client never re-submits: it polls
 *    the existing request id instead.
 *
 * Authentication is `Authorization: Key <FAL_KEY>`, read from the server environment only.
 */

export const FAL_QUEUE_BASE = "https://queue.fal.run";

export type FalErrorCode =
  | "not_configured"
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "bad_response";

export class FalError extends Error {
  readonly code: FalErrorCode;
  readonly status: number | null;

  constructor(code: FalErrorCode, detail: string, status: number | null = null) {
    super(detail.slice(0, 300));
    this.name = "FalError";
    this.code = code;
    this.status = status;
  }
}

export type FalSubmitReceipt = {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  cancelUrl: string | null;
  queuePosition: number | null;
};

export type FalStatus = {
  requestId: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  queuePosition: number | null;
};

type CallOptions = {
  fetchImpl?: typeof fetch;
  token?: string | null;
  timeoutMs?: number;
  retries?: number;
};

export function falKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.FAL_KEY?.trim() || env.FAL_API_KEY?.trim();
  return key ? key : null;
}

export function isFalConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return falKey(env) !== null;
}

function sanitise(text: string, key: string | null): string {
  let clean = text;
  if (key) clean = clean.split(key).join("[redacted]");
  return clean.replace(/Key\s+[A-Za-z0-9._\-]{8,}/g, "Key [redacted]").slice(0, 300);
}

function classify(status: number): FalErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 405) return "invalid_request"; // documented: a path-shaped request URL is refused
  if (status >= 500) return "provider_unavailable";
  return "invalid_request";
}

async function call<T>(url: string, init: RequestInit = {}, options: CallOptions = {}): Promise<T> {
  const key = options.token ?? falKey();
  if (!key) throw new FalError("not_configured", "FAL_KEY is not set on the server");

  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;
  let last: FalError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
          authorization: `Key ${key}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        throw new FalError("bad_response", sanitise(`non-JSON response (${response.status}): ${text.slice(0, 100)}`, key), response.status);
      }

      if (!response.ok) {
        const record = (body ?? {}) as Record<string, unknown>;
        const detail =
          typeof record.detail === "string" ? record.detail : typeof record.message === "string" ? record.message : `HTTP ${response.status}`;
        const code = classify(response.status);
        if ((code === "rate_limited" || code === "provider_unavailable") && attempt < retries) {
          last = new FalError(code, sanitise(detail, key), response.status);
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
          continue;
        }
        throw new FalError(code, sanitise(detail, key), response.status);
      }

      return body as T;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof FalError) {
        if ((error.code === "rate_limited" || error.code === "provider_unavailable") && attempt < retries) {
          last = error;
          continue;
        }
        throw error;
      }
      const aborted = error instanceof Error && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);
      last = new FalError(aborted ? "timeout" : "provider_unavailable", sanitise(`${aborted ? "timed out" : "network failure"}: ${message}`, key));
      if (attempt < retries) continue;
      throw last;
    } finally {
      clearTimeout(timer);
    }
  }

  throw last ?? new FalError("provider_unavailable", "request failed");
}

/**
 * Submits one inference. BILLABLE.
 *
 * Never retried by this module: fal's own queue already retries a failed runner, so a second submit is a
 * second charge, not a second attempt at the same work.
 */
export async function submitFal(
  modelId: string,
  input: Record<string, unknown>,
  options: CallOptions = {}
): Promise<FalSubmitReceipt> {
  const clean = modelId.trim().replace(/^\/+/, "");
  if (!clean.includes("/")) throw new FalError("invalid_request", "model id must look like owner/app/path");

  const body = await call<Record<string, unknown>>(
    `${FAL_QUEUE_BASE}/${clean}`,
    { method: "POST", body: JSON.stringify(input) },
    { ...options, retries: 0 }
  );

  const requestId = String(body.request_id ?? "");
  if (!requestId) throw new FalError("bad_response", "provider returned no request_id");

  // The returned URLs are authoritative; rebuilding them from the model path yields a documented 405.
  return {
    requestId,
    statusUrl: String(body.status_url ?? ""),
    responseUrl: String(body.response_url ?? ""),
    cancelUrl: body.cancel_url ? String(body.cancel_url) : null,
    queuePosition: typeof body.queue_position === "number" ? body.queue_position : null,
  };
}

export async function falStatus(receipt: Pick<FalSubmitReceipt, "requestId" | "statusUrl">, options: CallOptions = {}): Promise<FalStatus> {
  const url = receipt.statusUrl || `${FAL_QUEUE_BASE}/requests/${receipt.requestId}/status`;
  const body = await call<Record<string, unknown>>(url, {}, options);
  const raw = String(body.status ?? "");
  const map: Record<string, FalStatus["status"]> = {
    IN_QUEUE: "IN_QUEUE",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    in_queue: "IN_QUEUE",
    in_progress: "IN_PROGRESS",
    completed: "COMPLETED",
    failed: "FAILED",
    cancelled: "CANCELLED",
  };
  const status = map[raw];
  if (!status) throw new FalError("bad_response", `unknown status "${raw}"`);
  return {
    requestId: String(body.request_id ?? receipt.requestId),
    status,
    queuePosition: typeof body.queue_position === "number" ? body.queue_position : null,
  };
}

/** The result body. Its shape is the model's own, so it is returned whole and read generically. */
export async function falResult(
  receipt: Pick<FalSubmitReceipt, "requestId" | "responseUrl">,
  options: CallOptions = {}
): Promise<unknown> {
  const url = receipt.responseUrl || `${FAL_QUEUE_BASE}/requests/${receipt.requestId}`;
  return call<unknown>(url, {}, options);
}

export async function falCancel(receipt: Pick<FalSubmitReceipt, "requestId" | "cancelUrl">, options: CallOptions = {}): Promise<{ cancelled: boolean }> {
  if (!receipt.cancelUrl) return { cancelled: false };
  try {
    await call<unknown>(receipt.cancelUrl, { method: "PUT" }, { ...options, retries: 0 });
    return { cancelled: true };
  } catch (error) {
    // A cancel that arrives too late is a normal answer, not a failure of the caller's work.
    if (error instanceof FalError && (error.code === "not_found" || error.code === "invalid_request")) return { cancelled: false };
    throw error;
  }
}

/**
 * Non-billable connectivity check.
 *
 * fal documents no public catalogue endpoint on the Model API host, so this probe does not invent one: a
 * key is either present or it is not, and the honest answer is `credential_present` without claiming the
 * key works until a real call is made. `verifyKey` exists for the owner to run one cheap documented call.
 */
export function falReadiness(env: Record<string, string | undefined> = process.env): {
  configured: boolean;
  verified: boolean;
  detail: string;
} {
  const configured = isFalConfigured(env);
  return {
    configured,
    // Deliberately false: presence of a key is not evidence that it authenticates.
    verified: false,
    detail: configured
      ? "FAL_KEY is present. fal documents no free catalogue call, so the key is unverified until a billed call or the owner's own check confirms it."
      : "FAL_KEY is not set on the server.",
  };
}
