import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
  saveIntegrationConnection,
} from "@/lib/integrations/catalog";

const TOKEN_URL = "https://connector.get-ryze.ai/token";
const MCP_URL = "https://connector.get-ryze.ai/mcp";

export const RYZE_NOT_CONNECTED =
  "Ryze is not connected for this workspace. Connect it from Settings → Integrations with a Ryze refresh token.";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type RyzeSession = { accessToken: string; refreshToken: string };

/**
 * The stored secret is the Ryze refresh token: access tokens live one hour, so
 * every call trades the refresh token for a fresh access token first and saves
 * the rotated refresh token when Ryze issues a new one.
 */
async function ryzeSession(workspaceId: string): Promise<Result<RyzeSession>> {
  const tokens = await getIntegrationTokens(workspaceId, "ryze");
  const refresh =
    tokens && typeof tokens.accessToken === "string" ? tokens.accessToken : "";
  if (!refresh) {
    return { ok: false, error: RYZE_NOT_CONNECTED };
  }
  const clientId = process.env.RYZE_CLIENT_ID ?? "";
  if (!clientId) {
    return { ok: false, error: "RYZE_CLIENT_ID is not configured on the server." };
  }
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 400 || response.status === 401) {
      const message = "Ryze rejected the refresh token";
      await markConnectionError(workspaceId, "ryze", message);
      return { ok: false, error: message };
    }
    if (!response.ok) {
      return { ok: false, error: `Ryze token endpoint returned ${response.status}` };
    }
    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    const accessToken = payload.access_token ?? "";
    if (!accessToken) {
      return { ok: false, error: "Ryze returned no access token" };
    }
    const refreshToken = payload.refresh_token ?? refresh;
    if (refreshToken !== refresh) {
      await saveIntegrationConnection({
        workspaceId,
        providerId: "ryze",
        tokens: { accessToken: refreshToken, tokenType: "bearer" },
        scopes: ["ryze-mcp"],
        displayName: "Ryze Ads",
        connectedBy: null,
        expiresAt: null,
      });
    }
    return { ok: true, data: { accessToken, refreshToken } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ryze refresh failed",
    };
  }
}

async function mcpRpc(
  accessToken: string,
  payload: Record<string, unknown>,
  sessionId?: string
): Promise<{ body: string; sessionId: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Ryze MCP returned ${response.status}`);
  }
  return {
    body: await response.text(),
    sessionId: response.headers.get("mcp-session-id") ?? sessionId ?? null,
  };
}

function parseRpc(body: string): Record<string, unknown> {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  const dataLine = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .pop();
  if (!dataLine) {
    throw new Error("Ryze MCP returned an unexpected response");
  }
  return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
}

async function ryzeTool(
  workspaceId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Result<unknown>> {
  const session = await ryzeSession(workspaceId);
  if (!session.ok) {
    return session;
  }
  try {
    const init = await mcpRpc(session.data.accessToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "zooka-ai", version: "1" },
      },
    });
    const sessionId = init.sessionId;
    if (sessionId) {
      await mcpRpc(
        session.data.accessToken,
        { jsonrpc: "2.0", method: "notifications/initialized" },
        sessionId
      );
    }
    const call = await mcpRpc(
      session.data.accessToken,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      sessionId ?? undefined
    );
    const parsed = parseRpc(call.body);
    const error = parsed.error as { message?: string } | undefined;
    if (error) {
      return { ok: false, error: error.message ?? "Ryze tool call failed" };
    }
    const result = (parsed.result as Record<string, unknown> | undefined) ?? {};
    const content = Array.isArray(result.content)
      ? (result.content as { type?: string; text?: string }[])
      : [];
    const text = content.find((item) => typeof item.text === "string")?.text;
    if (!text) {
      return { ok: true, data: result };
    }
    try {
      return { ok: true, data: JSON.parse(text) as unknown };
    } catch {
      return { ok: true, data: text };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ryze tool call failed",
    };
  }
}

function customerId(value: string) {
  const match = value.match(/(\d{6,})/);
  return match ? match[1] : value;
}

export async function listGoogleAdsCustomers(workspaceId: string) {
  const accessible = await ryzeTool(
    workspaceId,
    "google_ads__listAccessibleCustomers",
    {}
  );
  if (!accessible.ok) {
    return accessible;
  }
  const payload = (accessible.data ?? {}) as { resourceNames?: string[] };
  const ids = (payload.resourceNames ?? []).map(customerId);
  const customers: Record<string, unknown>[] = [];
  for (const id of ids.slice(0, 10)) {
    const hierarchy = await ryzeTool(workspaceId, "google_ads__getAccountHierarchy", {
      customerId: id,
    });
    const rows = Array.isArray(hierarchy.ok ? hierarchy.data : [])
      ? ((hierarchy.ok ? hierarchy.data : []) as Record<string, unknown>[])
      : [];
    const row = rows[0] ?? {};
    customers.push({
      customerId: id,
      name: typeof row.descriptiveName === "string" ? row.descriptiveName : null,
      manager: row.manager ?? null,
      parentCustomerId: row.parentCustomerId ?? null,
    });
  }
  return {
    ok: true as const,
    data: { count: customers.length, customers },
  };
}

export async function googleAdsAccountSummary(
  workspaceId: string,
  options: { customerId: string; startDate: string; endDate: string }
) {
  const id = customerId(options.customerId);
  if (!/^\d{6,}$/.test(id)) {
    return { ok: false as const, error: "customerId must be the numeric Google Ads id." };
  }
  const summary = await ryzeTool(workspaceId, "google_ads__getAccountSummary", {
    customerId: id,
    period: { startDate: options.startDate, endDate: options.endDate },
  });
  if (!summary.ok) {
    return summary;
  }
  return { ok: true as const, data: summary.data };
}

export async function runGoogleAdsQuery(
  workspaceId: string,
  options: { customerId: string; query: string }
) {
  const id = customerId(options.customerId);
  if (!/^\d{6,}$/.test(id)) {
    return { ok: false as const, error: "customerId must be the numeric Google Ads id." };
  }
  const query = options.query.trim();
  if (!/^select\s/i.test(query)) {
    return { ok: false as const, error: "Only read queries (SELECT …) are allowed." };
  }
  const result = await ryzeTool(workspaceId, "google_ads__runRawGaql", {
    customerId: id,
    query,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true as const, data: result.data };
}
