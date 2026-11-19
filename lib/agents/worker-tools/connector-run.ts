import type { WorkerTool, WorkerToolResult } from "../worker-types";
import { redact } from "../worker-types";
import { getIntegrationTokens } from "@/lib/integrations/catalog";
import { runConnectorOperation } from "@/lib/integrations/connectors/execute";
import { CONNECTOR_SPECS, getConnectorSpec } from "@/lib/integrations/connectors/registry";

/**
 * The bridge that lets the agent actually use a connector during a task.
 *
 * Two tools, in this order:
 *   connector_catalog — what this workspace can reach, and the real operation ids.
 *   connector_read    — one read operation, through the executor.
 *
 * The workspace comes from the task context and is never read from the payload: a
 * model that invents an organization id cannot reach another tenant's credential,
 * because the id it sends is ignored. The executor still owns everything that
 * matters — the tenant's encrypted credential, the read cap, the audit row, and the
 * refusal of writes — so this file adds no network code of its own.
 *
 * Writes stay excluded on purpose. Spending, publishing and sending need explicit
 * owner approval, and a tool the model can call on its own must not be able to do
 * any of them.
 */

const MAX_EVIDENCE_CHARS = 20_000;

function compact(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > MAX_EVIDENCE_CHARS
    ? `${text.slice(0, MAX_EVIDENCE_CHARS)}…[truncated]`
    : text;
}

function evidenceOf(value: unknown) {
  // Redacted before it can be stored, and truncated so one huge page cannot
  // become the artifact.
  return JSON.parse(JSON.stringify(redact(compact(value))));
}

const FAILURE_TEXT: Record<string, string> = {
  not_connected:
    "This workspace has no credential for that connector yet, so nothing was requested from the provider.",
  not_configured:
    "The connector layer is not configured in this environment, so no request was made.",
  unknown_provider: "That connector is not in the registry.",
  unknown_operation: "That connector has no such read operation.",
  write_blocked:
    "That operation is a write. Writes need explicit owner approval and cannot run from a task.",
  usage_limit: "The monthly read cap for this connector is used up.",
  provider_error: "The provider refused the request. The connection is marked unhealthy.",
  network_error: "The provider could not be reached.",
};

export const connectorCatalog: WorkerTool = {
  name: "connector_catalog",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 1,
  description:
    "Lists the connectors this workspace can use, whether each one is connected, and the exact read operation ids. Read-only. Call this before connector_read.",
  async run({ organizationId }): Promise<WorkerToolResult> {
    const providers = await Promise.all(
      CONNECTOR_SPECS.map(async (spec) => {
        const tokens = await getIntegrationTokens(organizationId, spec.providerId);
        const connected = Boolean(
          tokens && typeof tokens.accessToken === "string" && tokens.accessToken
        );
        return {
          providerId: spec.providerId,
          label: spec.label,
          labelAr: spec.labelAr,
          connected,
          credentialType: spec.credentialType,
          readOperations: spec.operations
            .filter((operation) => operation.kind === "read")
            .map((operation) => ({
              id: operation.id,
              titleEn: operation.titleEn,
              titleAr: operation.titleAr,
            })),
          blockers: spec.blockers,
        };
      })
    );

    const connected = providers.filter((provider) => provider.connected);
    const totalOperations = providers.reduce(
      (sum, provider) => sum + provider.readOperations.length,
      0
    );

    return {
      ok: true,
      summary: `${providers.length} connectors, ${connected.length} connected in this workspace, ${totalOperations} read operations.`,
      evidence: evidenceOf({ providers }),
    };
  },
};

export const connectorRead: WorkerTool = {
  name: "connector_read",
  readOnly: true,
  timeoutMs: 25_000,
  maxAttempts: 2,
  description:
    "Runs one read operation on a connector the workspace has connected, and returns the rows it fetched. Read-only. Use the operation ids from connector_catalog.",
  async run({ organizationId, payload }): Promise<WorkerToolResult> {
    const providerId =
      typeof payload.providerId === "string" ? payload.providerId.trim() : "";
    const operationId =
      typeof payload.operationId === "string" ? payload.operationId.trim() : "";

    if (!providerId || !operationId) {
      return {
        ok: false,
        summary: "connector_read needs providerId and operationId.",
        error: "invalid_payload",
      };
    }

    // Cheap refusals first, so a wrong id never costs a credential read.
    const spec = getConnectorSpec(providerId);
    if (!spec) {
      return {
        ok: false,
        summary: FAILURE_TEXT.unknown_provider,
        error: "unknown_provider",
      };
    }
    const operation = spec.operations.find((entry) => entry.id === operationId);
    if (!operation) {
      return {
        ok: false,
        summary: FAILURE_TEXT.unknown_operation,
        error: "unknown_operation",
      };
    }
    if (operation.kind !== "read") {
      return {
        ok: false,
        summary: FAILURE_TEXT.write_blocked,
        error: "write_blocked",
      };
    }

    // The workspace is the task's, never the model's: a payload field named
    // organizationId or workspaceId is ignored by construction.
    const result = await runConnectorOperation({
      workspaceId: organizationId,
      providerId,
      operationId,
    });

    if (!result.ok) {
      return {
        ok: false,
        summary: `${spec.label}: ${FAILURE_TEXT[result.code] ?? result.error}`,
        error: result.code,
      };
    }

    const count = result.count === null ? null : result.count;
    return {
      ok: true,
      summary:
        count === null
          ? `${spec.label} ${operation.titleEn}: answered ${result.status}.`
          : `${spec.label} ${operation.titleEn}: ${count} row${count === 1 ? "" : "s"}.`,
      evidence: evidenceOf({
        providerId,
        operationId,
        status: result.status,
        count,
        rows: result.summary,
      }),
    };
  },
};
