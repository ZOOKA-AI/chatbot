import "server-only";

/**
 * Validating an agent configuration change, before it reaches the database.
 *
 * Kept pure so the rules can be tested without a connection, and kept strict because an
 * agent's scopes are its authority: a typo that silently dropped to "all tools" would be a
 * privilege escalation dressed as a form.
 */

export const AGENT_SCOPES = [
  "task:read",
  "task:create",
  "task:claim",
  "task:report",
  "approval:read",
  "approval:decide",
  "agent:manage",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_STATUSES = ["active", "disabled"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type AgentPatch = {
  displayName?: string;
  status?: AgentStatus;
  scopes?: AgentScope[];
  environment?: string;
};

export type PatchResult = { ok: true; patch: AgentPatch } | { ok: false; error: string };

const ENVIRONMENTS = new Set(["production", "preview", "development"]);

/**
 * Unknown keys are refused rather than ignored: a caller that thinks it is setting a field
 * the platform does not have should be told, not quietly believed.
 */
export function parseAgentPatch(body: unknown): PatchResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const input = body as Record<string, unknown>;
  const allowed = new Set(["displayName", "status", "scopes", "environment"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown_fields:${unknown.join(",")}` };
  }

  const patch: AgentPatch = {};

  if (input.displayName !== undefined) {
    if (typeof input.displayName !== "string") return { ok: false, error: "invalid_display_name" };
    const value = input.displayName.trim();
    if (value.length < 2 || value.length > 120) return { ok: false, error: "invalid_display_name" };
    patch.displayName = value;
  }

  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !(AGENT_STATUSES as readonly string[]).includes(input.status)) {
      return { ok: false, error: "invalid_status" };
    }
    patch.status = input.status as AgentStatus;
  }

  if (input.environment !== undefined) {
    if (typeof input.environment !== "string" || !ENVIRONMENTS.has(input.environment)) {
      return { ok: false, error: "invalid_environment" };
    }
    patch.environment = input.environment;
  }

  if (input.scopes !== undefined) {
    if (!Array.isArray(input.scopes)) return { ok: false, error: "invalid_scopes" };
    const requested = input.scopes.filter((value): value is string => typeof value === "string");
    if (requested.length !== input.scopes.length) return { ok: false, error: "invalid_scopes" };
    const unknownScopes = requested.filter((scope) => !(AGENT_SCOPES as readonly string[]).includes(scope));
    if (unknownScopes.length > 0) {
      return { ok: false, error: `unknown_scopes:${unknownScopes.join(",")}` };
    }
    // An empty scope list is not "no change": it is an agent that can do nothing, which is
    // a configuration its owner should disable rather than hold silently.
    if (requested.length === 0) return { ok: false, error: "scopes_cannot_be_empty" };

    const unique = [...new Set(requested)] as AgentScope[];
    // A claim without a report is a task that never finishes; refuse the pair that creates
    // that state rather than discovering it at execution time.
    if (unique.includes("task:claim") && !unique.includes("task:report")) {
      return { ok: false, error: "task_claim_requires_task_report" };
    }
    patch.scopes = unique;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "empty_patch" };
  return { ok: true, patch };
}

/**
 * Refuses the change that would leave a workspace with no way to execute work. Called with
 * the count of *other* active agents, not the total.
 */
export function guardLastActiveAgent(patch: AgentPatch, otherActiveAgents: number): PatchResult {
  if (patch.status === "disabled" && otherActiveAgents <= 0) {
    return { ok: false, error: "cannot_disable_last_active_agent" };
  }
  return { ok: true, patch };
}
