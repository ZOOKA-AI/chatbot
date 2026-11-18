import "server-only";

import { getN8nCredentials, type N8nCredentials } from "./store";

/**
 * Admin-only, read-only view of a workspace's own n8n instance.
 *
 * Two rules decide everything in this file:
 *
 * 1. Only GET. The dashboard exists so an owner can see what their automations are doing, not so a
 *    page render can start, stop, edit or delete one. There is no write verb anywhere below, and a
 *    test fails if one appears.
 * 2. A status is a measurement, not a stored fact. "Configured" means rows exist. "Connected" means
 *    an authenticated call to the instance just succeeded. A saved API key alone never earns a green
 *    badge, because the most common way an automation silently dies is a key that still looks stored.
 */

export type N8nStage =
  | "not_configured"
  | "configured"
  | "connected"
  | "operational"
  | "agent_ready";

export type N8nStageInput = {
  configured: boolean;
  probeOk: boolean;
  activeWorkflows: number;
  lastSuccessAt: string | null;
  agentWebhookConfigured: boolean;
  now?: Date;
};

/** How long a successful run keeps an instance "operational" before it is merely "connected". */
const OPERATIONAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type N8nWorkflowSummary = {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string | null;
  /** n8n's own UI route for the workflow. Opening it is a normal browser navigation, not an API call. */
  deepLink: string;
};

export type N8nExecutionSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  /** n8n's reported status, or "unknown" when the instance does not expose one. Never inferred. */
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  finished: boolean;
};

export type N8nAdminOverview = {
  stage: N8nStage;
  baseUrl: string | null;
  /** Why the stage is not higher. Empty when the instance is operational. */
  reasons: string[];
  workflowCount: number;
  activeWorkflowCount: number;
  workflows: N8nWorkflowSummary[];
  executions: N8nExecutionSummary[];
  errors: N8nExecutionSummary[];
  lastSuccessAt: string | null;
  probedAt: string;
  probeError: "unreachable" | "unauthorized" | "bad_response" | null;
};

/**
 * Pure: the whole status model in one place so it can be tested without a network or a database.
 * Each stage requires the one before it, so nothing can skip from "configured" to "operational".
 */
export function classifyN8nStage(input: N8nStageInput): { stage: N8nStage; reasons: string[] } {
  if (!input.configured) {
    return { stage: "not_configured", reasons: ["no_credentials_stored"] };
  }
  if (!input.probeOk) {
    return { stage: "configured", reasons: ["authenticated_probe_failed"] };
  }
  if (input.activeWorkflows === 0) {
    return { stage: "connected", reasons: ["no_active_workflows"] };
  }
  const now = (input.now ?? new Date()).getTime();
  const last = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  const recentSuccess =
    Number.isFinite(last) && now - last <= OPERATIONAL_WINDOW_MS && last <= now + 60_000;
  if (!recentSuccess) {
    return { stage: "connected", reasons: ["no_recent_successful_execution"] };
  }
  if (!input.agentWebhookConfigured) {
    return {
      stage: "operational",
      reasons: ["agent_webhook_key_not_configured"],
    };
  }
  return { stage: "agent_ready", reasons: [] };
}

type FetchOutcome =
  | { ok: true; payload: unknown }
  | { ok: false; error: "unreachable" | "unauthorized" | "bad_response" };

async function getJson(url: string, apiKey: string): Promise<FetchOutcome> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-N8N-API-KEY": apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "unauthorized" };
    }
    if (!response.ok) {
      return { ok: false, error: "bad_response" };
    }
    return { ok: true, payload: await response.json() };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

function asArray(payload: unknown): Record<string, unknown>[] {
  const data = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(data)
    ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value ? value : null;
}

function normaliseStatus(row: Record<string, unknown>): string {
  const status = text(row, "status");
  if (status) return status;
  // Older instances omit status. Say so rather than guessing success from `finished`.
  return row.finished === true ? "finished_unknown" : "unknown";
}

/**
 * Reads one workspace's instance. The organization id is the only input, and the credential is looked
 * up by it, so a caller cannot point this at another tenant's n8n account.
 */
export async function buildN8nAdminOverview(
  organizationId: string,
  now: Date = new Date()
): Promise<N8nAdminOverview> {
  const probedAt = now.toISOString();
  const credentials: N8nCredentials | null = await getN8nCredentials(organizationId);
  const base = {
    baseUrl: credentials?.baseUrl ?? null,
    workflowCount: 0,
    activeWorkflowCount: 0,
    workflows: [] as N8nWorkflowSummary[],
    executions: [] as N8nExecutionSummary[],
    errors: [] as N8nExecutionSummary[],
    lastSuccessAt: null as string | null,
    probedAt,
  };

  if (!credentials) {
    return {
      ...base,
      stage: "not_configured",
      reasons: ["no_credentials_stored"],
      probeError: null,
    };
  }

  const workflowsOutcome = await getJson(
    `${credentials.baseUrl}/api/v1/workflows?limit=250`,
    credentials.apiKey
  );

  if (!workflowsOutcome.ok) {
    // Stored but unproven: exactly the case that must never render as connected.
    return {
      ...base,
      stage: "configured",
      reasons: ["authenticated_probe_failed"],
      probeError: workflowsOutcome.error,
    };
  }

  const workflows: N8nWorkflowSummary[] = asArray(workflowsOutcome.payload)
    .map((row) => {
      const id = text(row, "id");
      if (!id) return null;
      return {
        id,
        name: text(row, "name") ?? "(unnamed workflow)",
        active: row.active === true,
        updatedAt: text(row, "updatedAt"),
        deepLink: `${credentials.baseUrl}/workflow/${encodeURIComponent(id)}`,
      } satisfies N8nWorkflowSummary;
    })
    .filter((row): row is N8nWorkflowSummary => row !== null)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  const executionsOutcome = await getJson(
    `${credentials.baseUrl}/api/v1/executions?limit=40`,
    credentials.apiKey
  );
  const nameById = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
  const executions: N8nExecutionSummary[] = executionsOutcome.ok
    ? asArray(executionsOutcome.payload)
        .map((row) => {
          const id = text(row, "id");
          if (!id) return null;
          const workflowId = text(row, "workflowId");
          return {
            id,
            workflowId,
            workflowName: workflowId ? (nameById.get(workflowId) ?? null) : null,
            status: normaliseStatus(row),
            startedAt: text(row, "startedAt"),
            stoppedAt: text(row, "stoppedAt"),
            finished: row.finished === true,
          } satisfies N8nExecutionSummary;
        })
        .filter((row): row is N8nExecutionSummary => row !== null)
        .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
    : [];

  const errors = executions.filter(
    (execution) => execution.status === "error" || execution.status === "crashed" || execution.status === "failed"
  );
  const lastSuccessAt =
    executions
      .filter((execution) => execution.status === "success")
      .map((execution) => execution.stoppedAt ?? execution.startedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  const agentWebhookConfigured = Boolean(
    process.env.AGENT_WEBHOOK_KEY ?? process.env.SOLAS_AGENT_KEY
  );

  const { stage, reasons } = classifyN8nStage({
    configured: true,
    probeOk: true,
    activeWorkflows: workflows.filter((workflow) => workflow.active).length,
    lastSuccessAt,
    agentWebhookConfigured,
    now,
  });

  return {
    ...base,
    stage,
    reasons,
    workflowCount: workflows.length,
    activeWorkflowCount: workflows.filter((workflow) => workflow.active).length,
    workflows,
    executions,
    errors,
    lastSuccessAt,
    probeError: null,
  };
}
