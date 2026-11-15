import "server-only";

import { buildHeaders } from "@/lib/integrations/connectors/auth";
import { getConnectorSpec } from "@/lib/integrations/connectors/registry";
import type { ConnectorOperation } from "@/lib/integrations/connectors/types";
import {
  appendAudit,
  getIntegrationTokens,
  getIntegrationUsage,
  markConnectionError,
  recordIntegrationUsage,
} from "@/lib/integrations/catalog";

/**
 * The only place connectors touch the network.
 *
 * Every call: resolves the tenant's own encrypted credential for that
 * workspace, refuses writes, enforces the monthly read cap, appends an audit
 * row (never the credential), and counts the read. A provider failure marks the
 * connection so the UI stops claiming it is healthy.
 */
export const CONNECTOR_READ_CAP_PER_MONTH = 2000;

export type ConnectorRunResult =
  | {
      ok: true;
      providerId: string;
      operationId: string;
      status: number;
      summary: unknown;
      count: number | null;
    }
  | {
      ok: false;
      providerId: string;
      operationId: string | null;
      error: string;
      code:
        | "not_configured"
        | "unknown_provider"
        | "unknown_operation"
        | "not_connected"
        | "write_blocked"
        | "usage_limit"
        | "provider_error"
        | "network_error";
    };

function credentialFields(
  raw: string,
  parse: (value: string) => Record<string, string>,
  stored: Record<string, unknown>
) {
  const fields = parse(raw);
  // Values captured at connect time (X user id, Notion workspace, ...) fill any
  // placeholder an operation needs without asking the user again.
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === "string" && value && !fields[key]) {
      fields[key] = value;
    }
  }
  return fields;
}

function compactRows(rows: unknown[], limit = 5) {
  return rows.slice(0, limit).map((row) => {
    if (!row || typeof row !== "object") {
      return row;
    }
    const entries = Object.entries(row as Record<string, unknown>).filter(
      ([, value]) =>
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    );
    return Object.fromEntries(entries.slice(0, 8));
  });
}

function summarize(payload: Record<string, unknown>, operation: ConnectorOperation) {
  if (operation.responseKind === "text") {
    const text = String(payload.text ?? "");
    return { preview: text.slice(0, 600), length: text.length };
  }
  if (operation.collectionPath) {
    const value = payload[operation.collectionPath];
    if (Array.isArray(value)) {
      return { items: compactRows(value), count: value.length };
    }
    if (value && typeof value === "object") {
      const nested = Object.values(value as Record<string, unknown>).find(
        (entry) => Array.isArray(entry)
      );
      if (Array.isArray(nested)) {
        return { items: compactRows(nested), count: nested.length };
      }
      return value;
    }
  }
  const keys = Object.keys(payload);
  return Object.fromEntries(
    keys.slice(0, 12).map((key) => [key, payload[key]] as const)
  );
}

async function fetchOperation(
  url: string,
  init: RequestInit
): Promise<{ status: number; ok: boolean; body: string; contentType: string }> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    ok: response.ok,
    body: await response.text(),
    contentType,
  };
}

export async function runConnectorOperation(input: {
  workspaceId: string;
  providerId: string;
  operationId: string;
  userId?: string | null;
}): Promise<ConnectorRunResult> {
  const spec = getConnectorSpec(input.providerId);
  if (!spec) {
    return {
      ok: false,
      providerId: input.providerId,
      operationId: input.operationId,
      error: "no connector spec for this provider",
      code: "unknown_provider",
    };
  }
  const operation = spec.operations.find((entry) => entry.id === input.operationId);
  if (!operation) {
    return {
      ok: false,
      providerId: input.providerId,
      operationId: input.operationId,
      error: `unknown operation; available: ${spec.operations.map((o) => o.id).join(", ")}`,
      code: "unknown_operation",
    };
  }
  if (operation.kind === "write") {
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: operation.id,
      error: spec.writeStatus,
      code: "write_blocked",
    };
  }

  const tokens = await getIntegrationTokens(input.workspaceId, spec.providerId);
  const raw = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  if (!tokens || !raw) {
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: operation.id,
      error: "this provider is not connected for this workspace",
      code: "not_connected",
    };
  }

  const metric = `connector_read_${spec.providerId}`;
  const used = await getIntegrationUsage(input.workspaceId, metric);
  if (used >= CONNECTOR_READ_CAP_PER_MONTH) {
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: operation.id,
      error: `monthly read cap reached (${used}/${CONNECTOR_READ_CAP_PER_MONTH}); raises plan to continue`,
      code: "usage_limit",
    };
  }

  const { accessToken: _token, ...stored } = tokens;
  const fields = credentialFields(raw, spec.parse, stored);
  const url = operation.url(fields);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "zooka-ai",
    ...buildHeaders(spec, fields),
  };
  const body = operation.body ? operation.body(fields) : undefined;
  if (body && operation.contentType) {
    headers["Content-Type"] = operation.contentType;
  }

  try {
    const result = await fetchOperation(url, {
      method: operation.method,
      headers,
      body,
    });

    await recordIntegrationUsage(input.workspaceId, metric, 1);
    await appendAudit({
      workspaceId: input.workspaceId,
      providerId: spec.providerId,
      action: `read:${operation.id}`,
      userId: input.userId ?? null,
      detail: { status: result.status, ok: result.ok },
    });

    if (!result.ok) {
      const message = `provider returned ${result.status}`;
      if (result.status === 401 || result.status === 403) {
        await markConnectionError(input.workspaceId, spec.providerId, message);
      }
      return {
        ok: false,
        providerId: spec.providerId,
        operationId: operation.id,
        error: message,
        code: "provider_error",
      };
    }

    const payload =
      operation.responseKind === "text"
        ? { text: result.body }
        : (JSON.parse(result.body) as Record<string, unknown>);
    const summary = summarize(payload, operation);
    const count =
      summary && typeof summary === "object" && "count" in summary
        ? Number((summary as { count: number }).count)
        : null;
    return {
      ok: true,
      providerId: spec.providerId,
      operationId: operation.id,
      status: result.status,
      summary,
      count,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    await appendAudit({
      workspaceId: input.workspaceId,
      providerId: spec.providerId,
      action: `read_failed:${operation.id}`,
      userId: input.userId ?? null,
      detail: { error: message },
    });
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: operation.id,
      error: message,
      code: "network_error",
    };
  }
}

/** Proves the stored credential still works, without re-pasting anything. */
export async function verifyConnectorConnection(input: {
  workspaceId: string;
  providerId: string;
  userId?: string | null;
}): Promise<ConnectorRunResult> {
  const spec = getConnectorSpec(input.providerId);
  if (!spec) {
    return {
      ok: false,
      providerId: input.providerId,
      operationId: null,
      error: "no connector spec for this provider",
      code: "unknown_provider",
    };
  }
  const tokens = await getIntegrationTokens(input.workspaceId, spec.providerId);
  const raw = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  if (!tokens || !raw) {
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: null,
      error: "this provider is not connected for this workspace",
      code: "not_connected",
    };
  }
  const { accessToken: _token, ...stored } = tokens;
  const fields = credentialFields(raw, spec.parse, stored);
  try {
    const result = await fetchOperation(spec.verify.url(fields), {
      method: spec.verify.method,
      headers: {
        Accept: "application/json",
        "User-Agent": "zooka-ai",
        ...buildHeaders(spec, fields),
      },
    });
    if (!result.ok) {
      await markConnectionError(
        input.workspaceId,
        spec.providerId,
        `provider returned ${result.status}`
      );
      return {
        ok: false,
        providerId: spec.providerId,
        operationId: null,
        error: `provider returned ${result.status}`,
        code: "provider_error",
      };
    }
    const described = spec.describe(
      safeJson(result.body)
    );
    await appendAudit({
      workspaceId: input.workspaceId,
      providerId: spec.providerId,
      action: "verified",
      userId: input.userId ?? null,
      detail: { status: result.status },
    });
    return {
      ok: true,
      providerId: spec.providerId,
      operationId: "verify",
      status: result.status,
      summary: {
        accountId: described.accountId,
        accountName: described.accountName,
        ...described.extra,
      },
      count: null,
    };
  } catch (error) {
    return {
      ok: false,
      providerId: spec.providerId,
      operationId: null,
      error: error instanceof Error ? error.message : "network error",
      code: "network_error",
    };
  }
}

function safeJson(body: string) {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}
