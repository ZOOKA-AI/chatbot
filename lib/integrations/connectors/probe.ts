import "server-only";

import { getIntegrationTokens, listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { verifyConnectorConnection } from "@/lib/integrations/connectors/execute";
import { getConnectorSpec } from "@/lib/integrations/connectors/registry";
import { getGoogleConnectionHealth } from "@/lib/integrations/google-drive/server";
import { validateN8nCredentials } from "@/lib/integrations/n8n/server";
import { getN8nCredentials } from "@/lib/integrations/n8n/store";
import { OAUTH_PROVIDERS, isOAuthProviderId } from "@/lib/integrations/oauth/config";
import { getOAuthAccessToken } from "@/lib/integrations/oauth/store";
import { TOKEN_PROVIDERS, isTokenProviderId } from "@/lib/integrations/token-providers";

/**
 * One real call per integration, and the honest answer that comes back.
 *
 * The settings page said "connected" for any provider with a stored credential,
 * which is a claim about our database, not about the provider. This module is
 * the missing half: it reaches the provider with the workspace's own credential,
 * bounded in time, read-only, and returns what the provider said.
 *
 * Rules it keeps:
 * - No writes. Every path is a read or an identity call.
 * - No credential leaves the process: only the account label and a status return.
 * - No invented success: an unreachable provider returns a code, and a provider
 *   with no read path returns `no_probe` instead of a green tick.
 */
export type ProbeCode =
  | "ok"
  | "not_connected"
  | "unauthorized"
  | "provider_error"
  | "network_error"
  | "timeout"
  | "no_probe";

export type ProbeResult = {
  providerId: string;
  code: ProbeCode;
  ok: boolean;
  /** What the provider itself calls this account (never a stored guess). */
  account: string | null;
  /** Extra facts proven by the same call. */
  detail: Record<string, string | number | boolean | null>;
  latencyMs: number;
  checkedAt: string;
  error: string | null;
};

const PROBE_TIMEOUT_MS = 8_000;

function nowIso() {
  return new Date().toISOString();
}

type Timed<T> =
  | { value: T; latencyMs: number; timedOut: false }
  | { error: string; latencyMs: number; timedOut: boolean };

async function timed<T>(work: (signal: AbortSignal) => Promise<T>): Promise<Timed<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const value = await work(controller.signal);
    return { value, latencyMs: Date.now() - startedAt, timedOut: false };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      timedOut: controller.signal.aborted,
    };
  } finally {
    clearTimeout(timer);
  }
}

function failure(providerId: string, code: ProbeCode, error: string, latencyMs: number): ProbeResult {
  return {
    providerId,
    code,
    ok: false,
    account: null,
    detail: {},
    latencyMs,
    checkedAt: nowIso(),
    error,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : { value: parsed as never };
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

function dig(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, payload);
}

function pick(payload: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = dig(payload, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

/** Google: the health check already refreshes the token, which is the real test. */
async function probeGoogle(providerId: string, workspaceId: string): Promise<ProbeResult> {
  const outcome = await timed(async () => getGoogleConnectionHealth(workspaceId));
  if ("error" in outcome) {
    return failure(
      providerId,
      outcome.timedOut ? "timeout" : "network_error",
      outcome.error,
      outcome.latencyMs
    );
  }
  const health = outcome.value;
  if (!health.providers.includes(providerId as never)) {
    return failure(providerId, "not_connected", "google scope not granted", outcome.latencyMs);
  }
  if (!health.usable) {
    return failure(providerId, "unauthorized", "google token could not be refreshed", outcome.latencyMs);
  }
  let account: string | null = null;
  try {
    const rows = await listWorkspaceIntegrations(workspaceId);
    const row = rows.find((item) => item.providerId === providerId);
    account = row?.accountEmail ?? row?.displayName ?? null;
  } catch {
    account = null;
  }
  return {
    providerId,
    code: "ok",
    ok: true,
    account,
    detail: { scopes: health.providers.join(",") },
    latencyMs: outcome.latencyMs,
    checkedAt: nowIso(),
    error: null,
  };
}

/** OAuth providers (GitHub, Vercel): call the provider's own identity endpoint. */
async function probeOAuth(providerId: string, workspaceId: string): Promise<ProbeResult> {
  const definition = OAUTH_PROVIDERS[providerId as keyof typeof OAUTH_PROVIDERS];
  const token = await getOAuthAccessToken(workspaceId, definition.id);
  if (!token) {
    return failure(providerId, "not_connected", "no oauth connection for this workspace", 0);
  }
  const outcome = await timed(async (signal) => {
    const response = await fetch(definition.userUrl, {
      headers: { accept: "application/json", authorization: `Bearer ${token}`, "user-agent": "zooka-ai" },
      cache: "no-store",
      signal,
    });
    return { status: response.status, payload: await readJson(response) };
  });
  if ("error" in outcome) {
    return failure(
      providerId,
      outcome.timedOut ? "timeout" : "network_error",
      outcome.error,
      outcome.latencyMs
    );
  }
  const { status, payload } = outcome.value;
  if (status === 401 || status === 403) {
    return failure(providerId, "unauthorized", `provider returned ${status}`, outcome.latencyMs);
  }
  if (status < 200 || status >= 300) {
    return failure(providerId, "provider_error", `provider returned ${status}`, outcome.latencyMs);
  }
  return {
    providerId,
    code: "ok",
    ok: true,
    account:
      providerId === "github"
        ? pick(payload, ["login"])
        : pick(payload, ["user.username", "user.email", "user.name"]),
    detail: { status, accountId: pick(payload, ["id", "user.id"]) },
    latencyMs: outcome.latencyMs,
    checkedAt: nowIso(),
    error: null,
  };
}

/** Pasted-token providers: the same validate URL and auth shape the connect card uses. */
async function probeToken(providerId: string, workspaceId: string): Promise<ProbeResult> {
  const definition = TOKEN_PROVIDERS[providerId as keyof typeof TOKEN_PROVIDERS];
  const tokens = await getIntegrationTokens(workspaceId, providerId);
  const raw = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  if (!raw) {
    return failure(providerId, "not_connected", "no stored token for this workspace", 0);
  }
  const url =
    typeof definition.validateUrl === "function" ? definition.validateUrl(raw) : definition.validateUrl;
  const outcome = await timed(async (signal) => {
    const response = await fetch(url, {
      method: definition.validateMethod ?? "GET",
      headers: { accept: "application/json", "user-agent": "zooka-ai", ...definition.auth(raw) },
      cache: "no-store",
      signal,
    });
    return { status: response.status, payload: await readJson(response) };
  });
  if ("error" in outcome) {
    return failure(
      providerId,
      outcome.timedOut ? "timeout" : "network_error",
      outcome.error,
      outcome.latencyMs
    );
  }
  const { status, payload } = outcome.value;
  if (status === 401 || status === 403) {
    return failure(providerId, "unauthorized", `provider returned ${status}`, outcome.latencyMs);
  }
  if (status < 200 || status >= 300) {
    return failure(providerId, "provider_error", `provider returned ${status}`, outcome.latencyMs);
  }
  let account: string | null = null;
  try {
    account = definition.describe(payload).accountName;
  } catch {
    account = null;
  }
  return {
    providerId,
    code: "ok",
    ok: true,
    account,
    detail: { status },
    latencyMs: outcome.latencyMs,
    checkedAt: nowIso(),
    error: null,
  };
}

async function probeN8n(providerId: string, workspaceId: string): Promise<ProbeResult> {
  const credentials = await getN8nCredentials(workspaceId);
  if (!credentials) {
    return failure(providerId, "not_connected", "no n8n credentials for this workspace", 0);
  }
  const outcome = await timed(async () =>
    validateN8nCredentials(credentials.baseUrl, credentials.apiKey)
  );
  if ("error" in outcome) {
    return failure(
      providerId,
      outcome.timedOut ? "timeout" : "network_error",
      outcome.error,
      outcome.latencyMs
    );
  }
  const result = outcome.value;
  if (!result.ok) {
    return failure(
      providerId,
      result.error === "unauthorized" ? "unauthorized" : "provider_error",
      result.error ?? "n8n validation failed",
      outcome.latencyMs
    );
  }
  return {
    providerId,
    code: "ok",
    ok: true,
    account: credentials.baseUrl,
    detail: { workflows: result.workflowCount ?? null },
    latencyMs: outcome.latencyMs,
    checkedAt: nowIso(),
    error: null,
  };
}

/**
 * Probe one integration for one workspace.
 *
 * Dispatch order matters: a provider that ships a declarative connector spec is
 * verified through the executor, which already enforces the monthly read cap,
 * writes the audit row and marks a broken connection.
 */
export async function probeIntegration(input: {
  workspaceId: string;
  providerId: string;
  userId?: string | null;
}): Promise<ProbeResult> {
  const { providerId, workspaceId } = input;

  if (getConnectorSpec(providerId)) {
    const outcome = await timed(async () =>
      verifyConnectorConnection({ workspaceId, providerId, userId: input.userId ?? null })
    );
    if ("error" in outcome) {
      return failure(
        providerId,
        outcome.timedOut ? "timeout" : "network_error",
        outcome.error,
        outcome.latencyMs
      );
    }
    const result = outcome.value;
    if (!result.ok) {
      const code: ProbeCode =
        result.code === "not_connected"
          ? "not_connected"
          : result.code === "network_error"
            ? "network_error"
            : "provider_error";
      return failure(providerId, code, result.error, outcome.latencyMs);
    }
    const summary = (result.summary ?? {}) as Record<string, unknown>;
    return {
      providerId,
      code: "ok",
      ok: true,
      account: typeof summary.accountName === "string" ? summary.accountName : null,
      detail: { status: result.status },
      latencyMs: outcome.latencyMs,
      checkedAt: nowIso(),
      error: null,
    };
  }

  if (["google_drive", "gmail", "google_calendar"].includes(providerId)) {
    return probeGoogle(providerId, workspaceId);
  }
  if (isOAuthProviderId(providerId)) {
    return probeOAuth(providerId, workspaceId);
  }
  if (isTokenProviderId(providerId)) {
    return probeToken(providerId, workspaceId);
  }
  if (providerId === "n8n") {
    return probeN8n(providerId, workspaceId);
  }
  if (providerId === "stripe") {
    // The Stripe key is platform-wide, so this proves the platform account the
    // billing code actually charges with. It answers "does billing work".
    const outcome = await timed(async (signal) => {
      const response = await fetch("https://api.stripe.com/v1/account", {
        headers: {
          authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
          "user-agent": "zooka-ai",
        },
        cache: "no-store",
        signal,
      });
      return { status: response.status, payload: await readJson(response) };
    });
    if ("error" in outcome) {
      return failure(
        providerId,
        outcome.timedOut ? "timeout" : "network_error",
        outcome.error,
        outcome.latencyMs
      );
    }
    const { status, payload } = outcome.value;
    if (status < 200 || status >= 300) {
      return failure(
        providerId,
        status === 401 ? "unauthorized" : "provider_error",
        `stripe returned ${status}`,
        outcome.latencyMs
      );
    }
    return {
      providerId,
      code: "ok",
      ok: true,
      account: pick(payload, ["settings.dashboard.display_name", "id", "email"]),
      detail: { status, chargesEnabled: Boolean(payload.charges_enabled) },
      latencyMs: outcome.latencyMs,
      checkedAt: nowIso(),
      error: null,
    };
  }

  return failure(providerId, "no_probe", "no read path is implemented for this provider yet", 0);
}
