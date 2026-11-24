// Connector skills for the worker.
//
// The chat surface could already inspect and call connectors; a queued task
// could not, so an agent told "check my Slack and tell me what came in" had no
// tool for it and had to say so. These four tools close that gap without
// inventing capability:
//
//   connector_catalog → what exists, straight from the code registry
//   connector_status  → what this workspace has actually connected
//   connector_read    → one read operation, refusing writes and missing creds
//   connector_link    → the real path a human must open to authorize, never a token
//
// None of them returns a credential, and none claims a verification it did not
// perform: an unconnected provider is reported as unconnected, not as empty.
import { getConnectorSpec } from "@/lib/integrations/connectors/registry";
import { buildIntegrationMatrix, matrixTotals } from "@/lib/integrations/connectors/matrix";
import { runConnectorOperation } from "@/lib/integrations/connectors/execute";
import { listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { isOAuthProviderId } from "@/lib/integrations/oauth/config";
import { TOKEN_PROVIDERS } from "@/lib/integrations/token-providers";

import type { WorkerTool } from "@/lib/agents/worker-types";

/** Providers that authorize through their own route rather than the generic one. */
const BESPOKE_AUTHORIZE: Record<string, string> = {
  tiktok: "/api/integrations/tiktok/authorize",
  "google-drive": "/api/integrations/google-drive/connect",
  "google-growth": "/api/integrations/google-growth/connect",
  x: "/api/integrations/x/connect",
};

/**
 * The path a person opens to authorize a provider. Deliberately a path, not an
 * absolute URL and not a token: the caller decides the origin, and no secret
 * ever enters a task result where it would be stored and replayed.
 */
export function connectPathFor(providerId: string): { path: string; mode: "oauth" | "token" } | null {
  const id = providerId.trim().toLowerCase();
  if (BESPOKE_AUTHORIZE[id]) {
    return { path: BESPOKE_AUTHORIZE[id], mode: "oauth" };
  }
  if (isOAuthProviderId(id)) {
    return { path: `/api/integrations/${id}/connect`, mode: "oauth" };
  }
  if (Object.hasOwn(TOKEN_PROVIDERS, id)) {
    return { path: "/settings/integrations", mode: "token" };
  }
  return null;
}

export const connectorCatalog: WorkerTool = {
  name: "connector_catalog",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 1,
  description:
    "Lists every SaaS connector the code registry knows, with its status, read operations and blockers. Read-only, calls no external service, and never reports a live verification it did not perform.",
  async run({ signal }) {
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before it started.", error: "aborted" };
    }
    const rows = buildIntegrationMatrix();
    const totals = matrixTotals(rows);
    const implemented = rows.filter((row) => row.providerImplemented).map((row) => row.providerId);
    return {
      ok: true,
      summary: `${implemented.length} of ${rows.length} connectors are implemented: ${implemented.join(", ")}.`,
      evidence: {
        totals,
        connectors: rows.map((row) => ({
          providerId: row.providerId,
          name: row.name,
          catalogStatus: row.catalogStatus,
          providerImplemented: row.providerImplemented,
          readOperations: row.readOperations,
          blockers: row.blockers,
        })),
        note: "Run connector_status for what this workspace has connected, and connector_read to call one operation.",
      },
    };
  },
};

export const connectorStatus: WorkerTool = {
  name: "connector_status",
  readOnly: true,
  timeoutMs: 15_000,
  maxAttempts: 1,
  description:
    "Reports which providers this workspace has connected, with the account name and any last error. Read-only: it lists stored connections and contacts no provider.",
  async run({ organizationId, signal }) {
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before it started.", error: "aborted" };
    }
    const connections = await listWorkspaceIntegrations(organizationId);
    const connected = connections.filter((row) => row.status === "connected");
    return {
      ok: true,
      summary: connected.length
        ? `${connected.length} provider(s) connected: ${connected.map((row) => row.providerId).join(", ")}.`
        : "No provider is connected for this workspace yet.",
      evidence: {
        connected: connected.map((row) => ({
          providerId: row.providerId,
          displayName: row.displayName,
          accountEmail: row.accountEmail,
          status: row.status,
          lastError: row.lastError,
        })),
        needsAttention: connections
          .filter((row) => row.lastError)
          .map((row) => ({ providerId: row.providerId, lastError: row.lastError })),
        connectPaths: connections
          .map((row) => row.providerId)
          .map((providerId) => ({ providerId, link: connectPathFor(providerId) }))
          .filter((entry) => entry.link !== null),
      },
    };
  },
};

export const connectorRead: WorkerTool = {
  name: "connector_read",
  readOnly: true,
  timeoutMs: 30_000,
  maxAttempts: 2,
  description:
    "Runs one read operation on a connected provider for this workspace and returns a compact result. It refuses writes, unknown providers and unconnected accounts instead of pretending the call happened.",
  async run({ organizationId, payload, signal }) {
    const providerId = typeof payload.providerId === "string" ? payload.providerId.trim() : "";
    const operationId = typeof payload.operationId === "string" ? payload.operationId.trim() : "";
    if (!providerId || !operationId) {
      return {
        ok: false,
        summary: "Both providerId and operationId are required.",
        error: "invalid_payload",
      };
    }
    const spec = getConnectorSpec(providerId);
    if (!spec) {
      return {
        ok: false,
        summary: `No connector is registered for "${providerId}". Run connector_catalog for the list.`,
        error: "unknown_provider",
      };
    }
    const operation = spec.operations.find((entry) => entry.id === operationId);
    if (!operation) {
      return {
        ok: false,
        summary: `"${operationId}" is not an operation of ${providerId}; available: ${spec.operations
          .map((entry) => entry.id)
          .join(", ")}.`,
        error: "unknown_operation",
      };
    }
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before the call started.", error: "aborted" };
    }
    const result = await runConnectorOperation({
      workspaceId: organizationId,
      providerId,
      operationId,
    });
    if (!result.ok) {
      return {
        ok: false,
        summary: `Read ${providerId}.${operationId} failed: ${result.error}`,
        error: result.code,
      };
    }
    return {
      ok: true,
      summary: `Read ${providerId}.${operationId} succeeded.`,
      evidence: result,
    };
  },
};

export const connectorLink: WorkerTool = {
  name: "connector_link",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 1,
  description:
    "Returns the real page or route a person must open to authorize a provider, plus whether it is an OAuth flow or a pasted token. It returns a path and a token hint, never a token value.",
  async run({ payload, signal }) {
    const providerId = typeof payload.providerId === "string" ? payload.providerId.trim() : "";
    if (!providerId) {
      return { ok: false, summary: "providerId is required.", error: "invalid_payload" };
    }
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before it started.", error: "aborted" };
    }
    const link = connectPathFor(providerId);
    if (!link) {
      return {
        ok: false,
        summary: `"${providerId}" has no authorization route in this build. Run connector_catalog to see what exists.`,
        error: "no_connect_route",
      };
    }
    const tokenProvider = Object.hasOwn(TOKEN_PROVIDERS, providerId)
      ? TOKEN_PROVIDERS[providerId as keyof typeof TOKEN_PROVIDERS]
      : null;
    return {
      ok: true,
      summary:
        link.mode === "oauth"
          ? `Open ${link.path} to authorize ${providerId}; the person grants access, not the agent.`
          : `Open ${link.path} and paste a ${providerId} token there; the agent never receives the value.`,
      evidence: {
        providerId,
        mode: link.mode,
        path: link.path,
        tokenHint: tokenProvider?.tokenHint ?? null,
        note: "The agent cannot complete authorization on the person's behalf; it can only tell them where to go.",
      },
    };
  },
};
