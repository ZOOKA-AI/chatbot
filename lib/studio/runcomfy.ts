import "server-only";

/**
 * RunComfy Model API v2, as documented.
 *
 * Every path here comes from https://docs.runcomfy.com/model-apis/* and nothing is guessed:
 *
 *   GET  https://model-api.runcomfy.net/v1/models            discover models + prices
 *   GET  https://model-api.runcomfy.net/v1/models/{id}       one model's input schema
 *   POST https://model-api.runcomfy.net/v1/models/{id}       submit, returns request_id
 *   GET  https://model-api.runcomfy.net/v1/requests/{id}/status
 *   GET  https://model-api.runcomfy.net/v1/requests/{id}/result?include_cost=true
 *   POST https://model-api.runcomfy.net/v1/requests/{id}/cancel
 *   GET  https://api.runcomfy.net/prod/v2/balance            the one wallet
 *
 * Two rules are structural rather than documented:
 *
 * 1. The token is read from the environment inside the server only. Nothing in this module returns it,
 *    logs it, or puts it in an error message: every failure path goes through `sanitise`, which redacts
 *    any occurrence of the token before the text leaves the module.
 * 2. Nothing here decides whether spending is allowed. This module is a transport; the gate lives in
 *    `cloud-cost.ts` and in the engine policy, so a caller cannot reach inference by importing a client.
 */

export const RUNCOMFY_MODEL_BASE = "https://model-api.runcomfy.net";
export const RUNCOMFY_CORE_BASE = "https://api.runcomfy.net/prod";

export type RunComfyErrorCode =
  | "not_configured"
  | "unauthorized"
  | "insufficient_balance"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "bad_response";

export class RunComfyError extends Error {
  readonly code: RunComfyErrorCode;
  readonly status: number | null;
  /** The provider's own numeric code when it sent one (400001, 400002, 400004, 403001, 404001). */
  readonly providerCode: number | null;

  constructor(code: RunComfyErrorCode, detail: string, status: number | null = null, providerCode: number | null = null) {
    super(detail.slice(0, 300));
    this.name = "RunComfyError";
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
  }
}

export type RunComfyModel = {
  modelId: string;
  displayName: string;
  categories: string[];
  kind: string;
  basePriceUsd: number | null;
  priceUnit: "output" | "second" | null;
  pricingNote: string | null;
  requiredInputs: string[];
  supportedBatchSize: number[];
};

export type RunComfySubmitReceipt = {
  requestId: string;
  statusUrl: string | null;
  resultUrl: string | null;
  cancelUrl: string | null;
};

export type RunComfyStatus = {
  requestId: string;
  status: "in_queue" | "in_progress" | "completed" | "cancelled" | "succeeded" | "failed";
  queuePosition: number | null;
};

export type RunComfyResult = {
  requestId: string;
  status: "succeeded" | "failed" | "in_queue" | "in_progress" | "cancelled";
  output: unknown;
  /** Present only when the caller asked for it: what this request actually charged, in USD. */
  costUsd: number | null;
  createdAt: string | null;
  finishedAt: string | null;
};

export type RunComfyBalance = {
  balanceUsd: number;
  balanceMicrodollars: number;
  currency: string;
};

type CallOptions = {
  fetchImpl?: typeof fetch;
  token?: string | null;
  timeoutMs?: number;
  /** Retries for the cases where retrying is safe: 429, 5xx, and a dropped connection. */
  retries?: number;
};

/** Reads the token on the server. A public variable would ship it to a browser, so it is not accepted. */
export function runcomfyToken(env: Record<string, string | undefined> = process.env): string | null {
  const token = env.RUNCOMFY_API_TOKEN?.trim();
  return token ? token : null;
}

export function isRunComfyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return runcomfyToken(env) !== null;
}

/** Removes the token from anything on its way to a log, a response, or a report. */
function sanitise(text: string, token: string | null): string {
  let clean = text;
  if (token) clean = clean.split(token).join("[redacted]");
  // A Bearer header echoed back by a proxy is the same leak in a different shape.
  return clean.replace(/Bearer\s+[A-Za-z0-9._\-]{8,}/g, "Bearer [redacted]").slice(0, 300);
}

function classify(status: number, providerCode: number | null): RunComfyErrorCode {
  if (providerCode === 400002) return "insufficient_balance";
  if (providerCode === 400004 || status === 401) return "unauthorized";
  if (providerCode === 403001 || status === 403) return "unauthorized";
  if (providerCode === 404001 || status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "invalid_request";
}

async function callJson<T>(
  path: string,
  init: RequestInit & { base?: string } = {},
  options: CallOptions = {}
): Promise<T> {
  const token = options.token ?? runcomfyToken();
  if (!token) {
    throw new RunComfyError("not_configured", "RUNCOMFY_API_TOKEN is not set on the server");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const base = init.base ?? RUNCOMFY_MODEL_BASE;
  const url = `${base}${path}`;
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;

  let lastError: RunComfyError | null = null;

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
          authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        throw new RunComfyError(
          "bad_response",
          sanitise(`provider returned non-JSON (${response.status}): ${text.slice(0, 120)}`, token),
          response.status
        );
      }

      if (!response.ok) {
        const record = (body ?? {}) as Record<string, unknown>;
        const providerCode =
          typeof record.code === "number" ? record.code : typeof record.error_code === "number" ? (record.error_code as number) : null;
        const detail =
          typeof record.message === "string"
            ? record.message
            : typeof record.error === "string"
              ? record.error
              : `HTTP ${response.status}`;
        const code = classify(response.status, providerCode);
        // 429 and 5xx are the only codes worth a second attempt.
        if ((code === "rate_limited" || code === "provider_unavailable") && attempt < retries) {
          lastError = new RunComfyError(code, sanitise(detail, token), response.status, providerCode);
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
          continue;
        }
        throw new RunComfyError(code, sanitise(detail, token), response.status, providerCode);
      }

      return body as T;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof RunComfyError) {
        if (error.code === "rate_limited" || error.code === "provider_unavailable") {
          if (attempt < retries) {
            lastError = error;
            continue;
          }
        }
        throw error;
      }
      const aborted = error instanceof Error && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);
      lastError = new RunComfyError(
        aborted ? "timeout" : "provider_unavailable",
        sanitise(`${aborted ? "request timed out" : "network failure"}: ${message}`, token)
      );
      if (attempt < retries) continue;
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new RunComfyError("provider_unavailable", "request failed");
}

function toModel(raw: Record<string, unknown>): RunComfyModel {
  const unit = raw.price_unit === "second" ? "second" : raw.price_unit === "output" ? "output" : null;
  return {
    modelId: String(raw.model_id ?? ""),
    displayName: String(raw.display_name ?? raw.model_id ?? ""),
    categories: Array.isArray(raw.categories) ? raw.categories.map((entry) => String(entry)) : [],
    kind: String(raw.kind ?? ""),
    basePriceUsd: typeof raw.base_price_usd === "number" ? raw.base_price_usd : null,
    priceUnit: unit,
    pricingNote: typeof raw.pricing_note === "string" ? raw.pricing_note : null,
    requiredInputs: Array.isArray(raw.required_inputs) ? raw.required_inputs.map((entry) => String(entry)) : [],
    supportedBatchSize: Array.isArray(raw.supported_batch_size)
      ? raw.supported_batch_size.filter((entry): entry is number => typeof entry === "number")
      : [],
  };
}

/** Lists models the account can run. Free: discovery is not inference. */
export async function listModels(
  input: { search?: string; category?: string; kind?: string; limit?: number; offset?: number } = {},
  options: CallOptions = {}
): Promise<{ models: RunComfyModel[]; total: number }> {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.category) params.set("category", input.category);
  if (input.kind) params.set("kind", input.kind);
  params.set("limit", String(Math.min(Math.max(input.limit ?? 50, 1), 500)));
  if (input.offset) params.set("offset", String(input.offset));

  const body = await callJson<Record<string, unknown>>(`/v1/models?${params.toString()}`, {}, options);
  const models = Array.isArray(body.models) ? body.models.map((entry) => toModel(entry as Record<string, unknown>)) : [];
  return { models, total: typeof body.total === "number" ? body.total : models.length };
}

/** One model's full record, including the input schema the request body must match. */
export async function getModel(modelId: string, options: CallOptions = {}): Promise<Record<string, unknown>> {
  if (!modelId.trim()) throw new RunComfyError("invalid_request", "model id is empty");
  return callJson<Record<string, unknown>>(`/v1/models/${encodeURIComponent(modelId)}`, {}, options);
}

/** The single wallet behind every RunComfy product. Free to read. */
export async function getBalance(options: CallOptions = {}): Promise<RunComfyBalance> {
  const body = await callJson<Record<string, unknown>>("/v2/balance", { base: RUNCOMFY_CORE_BASE }, options);
  const micro = typeof body.balance_microdollars === "number" ? body.balance_microdollars : 0;
  return {
    balanceMicrodollars: micro,
    balanceUsd: typeof body.balance_usd === "number" ? body.balance_usd : micro / 1_000_000,
    currency: typeof body.currency === "string" ? body.currency : "USD",
  };
}

/**
 * Submits one inference request. THIS IS THE BILLABLE CALL.
 *
 * It is not called by any code path that has not already passed the spend gate, and it is never called
 * by a test with a real token. The endpoint returns 200 with a request id, so a retry after a dropped
 * response could bill twice; the client therefore does not retry a submit, and dedupe sits above it.
 */
export async function submitRequest(
  modelId: string,
  payload: Record<string, unknown>,
  options: CallOptions = {}
): Promise<RunComfySubmitReceipt> {
  if (!modelId.trim()) throw new RunComfyError("invalid_request", "model id is empty");
  const body = await callJson<Record<string, unknown>>(
    `/v1/models/${encodeURIComponent(modelId)}`,
    { method: "POST", body: JSON.stringify(payload), base: RUNCOMFY_MODEL_BASE },
    { ...options, retries: 0 }
  );
  const requestId = String(body.request_id ?? "");
  if (!requestId) throw new RunComfyError("bad_response", "provider returned no request_id");
  return {
    requestId,
    statusUrl: typeof body.status_url === "string" ? body.status_url : null,
    resultUrl: typeof body.result_url === "string" ? body.result_url : null,
    cancelUrl: typeof body.cancel_url === "string" ? body.cancel_url : null,
  };
}

export async function requestStatus(requestId: string, options: CallOptions = {}): Promise<RunComfyStatus> {
  if (!requestId.trim()) throw new RunComfyError("invalid_request", "request id is empty");
  const body = await callJson<Record<string, unknown>>(
    `/v1/requests/${encodeURIComponent(requestId)}/status`,
    {},
    options
  );
  const status = String(body.status ?? "");
  const allowed = ["in_queue", "in_progress", "completed", "cancelled", "succeeded", "failed"] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) {
    throw new RunComfyError("bad_response", `unknown status "${status}"`);
  }
  return {
    requestId: String(body.request_id ?? requestId),
    status: status as RunComfyStatus["status"],
    queuePosition: typeof body.queue_position === "number" ? body.queue_position : null,
  };
}

/** Fetches the result, asking for the real charge so a report can state what it cost rather than guess. */
export async function requestResult(requestId: string, options: CallOptions = {}): Promise<RunComfyResult> {
  if (!requestId.trim()) throw new RunComfyError("invalid_request", "request id is empty");
  const body = await callJson<Record<string, unknown>>(
    `/v1/requests/${encodeURIComponent(requestId)}/result?include_cost=true`,
    {},
    options
  );
  const status = String(body.status ?? "");
  return {
    requestId: String(body.request_id ?? requestId),
    status: status as RunComfyResult["status"],
    output: body.output ?? null,
    costUsd: typeof body.cost === "number" ? body.cost : null,
    createdAt: typeof body.created_at === "string" ? body.created_at : null,
    finishedAt: typeof body.finished_at === "string" ? body.finished_at : null,
  };
}

/** Cancels a queued request. Returns the provider's honest outcome: `not_cancellable` is a real answer. */
export async function cancelRequest(
  requestId: string,
  options: CallOptions = {}
): Promise<{ outcome: "cancelled" | "not_cancellable" | "unknown" }> {
  if (!requestId.trim()) throw new RunComfyError("invalid_request", "request id is empty");
  const body = await callJson<Record<string, unknown>>(
    `/v1/requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST" },
    { ...options, retries: 0 }
  );
  const outcome = String(body.outcome ?? "");
  return {
    outcome: outcome === "cancelled" || outcome === "not_cancellable" ? outcome : "unknown",
  };
}

/**
 * A non-billable authenticated probe: reads discovery and the wallet, submits nothing.
 *
 * This is what makes "is it connected?" answerable without spending a cent, and it is also what proves
 * the token is valid rather than merely present.
 */
export async function probeConnection(options: CallOptions = {}): Promise<{
  connected: boolean;
  modelsVisible: number;
  categories: string[];
  balanceUsd: number | null;
  balanceMicrodollars: number | null;
  error: { code: RunComfyErrorCode; detail: string } | null;
}> {
  try {
    const [catalog, balance] = await Promise.all([
      listModels({ limit: 1 }, options),
      getBalance(options).catch(() => null),
    ]);
    const categories = new Set<string>();
    if (catalog.models.length > 0) {
      const detailed = await listModels({ limit: 50 }, options).catch(() => ({ models: [], total: 0 }));
      for (const model of detailed.models) for (const category of model.categories) categories.add(category);
    }
    return {
      connected: true,
      modelsVisible: catalog.total,
      categories: [...categories].sort(),
      balanceUsd: balance?.balanceUsd ?? null,
      balanceMicrodollars: balance?.balanceMicrodollars ?? null,
      error: null,
    };
  } catch (error) {
    if (error instanceof RunComfyError) {
      return {
        connected: false,
        modelsVisible: 0,
        categories: [],
        balanceUsd: null,
        balanceMicrodollars: null,
        error: { code: error.code, detail: error.message },
      };
    }
    return {
      connected: false,
      modelsVisible: 0,
      categories: [],
      balanceUsd: null,
      balanceMicrodollars: null,
      error: { code: "provider_unavailable", detail: "unknown failure" },
    };
  }
}
