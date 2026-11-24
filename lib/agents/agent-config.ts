import "server-only";

import { validateToolSelection } from "@/lib/agents/agent-tools";

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
  updateWithoutApproval?: boolean;
  deleteWithoutApproval?: boolean;
  sendMessagesWithoutApproval?: boolean;
  environment?: string;
  modelProvider?: string | null;
  modelId?: string | null;
  /** null clears the restriction; an array restricts this agent to those worker tools. */
  allowedTools?: string[] | null;
  instructions?: string | null;
};

/**
 * Providers a workspace administrator may select. The list is the same set the execution
 * layer can actually reach (`lib/platform/models.ts`); anything else is refused here rather
 * than discovered at the first task, where the failure would look like a tool problem.
 */
export const SELECTABLE_MODEL_PROVIDERS = [
  "gateway",
  "openai-compatible",
  "anthropic",
  "google",
  "ollama",
] as const;

export type SelectableModelProvider = (typeof SELECTABLE_MODEL_PROVIDERS)[number];

/**
 * Whether this deployment holds what the chosen provider needs. Reported, never enforced by
 * silence: an agent pinned to a provider with no key is a configuration error the owner
 * should see in the UI, not a task that fails at 3am.
 */
export function modelCredentialStatus(
  provider: string,
  env: Record<string, string | undefined> = process.env
): { ok: boolean; reason?: string } {
  if (!(SELECTABLE_MODEL_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, reason: "unsupported_provider" };
  }
  if (provider === "ollama") return { ok: true }; // a local endpoint needs no key
  if (provider === "gateway") {
    return env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN
      ? { ok: true }
      : { ok: false, reason: "missing_gateway_credential" };
  }
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY ? { ok: true } : { ok: false, reason: "missing_anthropic_credential" };
  }
  if (provider === "google") {
    return env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY
      ? { ok: true }
      : { ok: false, reason: "missing_google_credential" };
  }
  return env.MODEL_API_KEY || env.OPENAI_API_KEY
    ? { ok: true }
    : { ok: false, reason: "missing_openai_compatible_credential" };
}

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
  const allowed = new Set([
    "displayName",
    "status",
    "scopes",
    "updateWithoutApproval",
    "deleteWithoutApproval",
    "sendMessagesWithoutApproval",
    "environment",
    "modelProvider",
    "modelId",
    "allowedTools",
    "instructions",
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown_fields:${unknown.join(",")}` };
  }

  const patch: AgentPatch = {};

  for (const field of [
    "updateWithoutApproval",
    "deleteWithoutApproval",
    "sendMessagesWithoutApproval",
  ] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "boolean") {
        return { ok: false, error: `invalid_${field}` };
      }
      patch[field] = input[field];
    }
  }

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

  // Model selection is a pair. One without the other is the shape that produces a task
  // running a provider's default model while the UI shows nothing selected.
  const hasProvider = input.modelProvider !== undefined;
  const hasModel = input.modelId !== undefined;
  if (hasProvider !== hasModel) {
    return { ok: false, error: "model_provider_and_id_must_be_set_together" };
  }
  if (hasProvider && hasModel) {
    if (input.modelProvider === null && input.modelId === null) {
      // Explicitly clearing returns the agent to the deployment default.
      patch.modelProvider = null;
      patch.modelId = null;
    } else {
      if (typeof input.modelProvider !== "string" || !(SELECTABLE_MODEL_PROVIDERS as readonly string[]).includes(input.modelProvider)) {
        return { ok: false, error: "unsupported_model_provider" };
      }
      if (typeof input.modelId !== "string" || !/^[A-Za-z0-9._:/-]{2,80}$/.test(input.modelId)) {
        return { ok: false, error: "invalid_model_id" };
      }
      patch.modelProvider = input.modelProvider;
      patch.modelId = input.modelId;
    }
  }

  if (input.allowedTools !== undefined) {
    const tools = validateToolSelection(input.allowedTools);
    if (!tools.ok) return { ok: false, error: tools.error };
    patch.allowedTools = tools.tools;
  }

  if (input.instructions !== undefined) {
    if (input.instructions === null) {
      patch.instructions = null;
    } else {
      if (typeof input.instructions !== "string") return { ok: false, error: "instructions_must_be_a_string" };
      const text = input.instructions.trim();
      if (text.length > 4000) return { ok: false, error: "instructions_too_long" };
      patch.instructions = text.length === 0 ? null : text;
    }
  }

  // Only after every field has had its chance to populate the patch: a body carrying just
  // instructions used to be refused as "empty_patch" because this check ran too early.
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
