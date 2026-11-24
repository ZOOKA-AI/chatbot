import "server-only";

import { WORKER_TOOLS } from "@/lib/agents/worker";

/**
 * Which tools an agent may be assigned.
 *
 * The catalogue is derived from the worker's own registry rather than written out again, so
 * a tool that the execution layer cannot run can never appear in the picker, and a tool that
 * is added to the worker appears here without a second edit.
 *
 * Assigning a tool is an authorization decision: it decides what work this agent's tasks may
 * do. Nothing here accepts a tool id the platform does not implement.
 */

export interface ToolCatalogEntry {
  id: string;
  /** What it does, in the customer's terms. No capability the tool does not have. */
  summary: string;
  /** Whether running it changes anything outside the workspace. */
  writes: boolean;
  permission: AgentActionPermission;
}

export const AGENT_ACTION_PERMISSIONS = ["read", "update", "delete", "send", "spend"] as const;
export type AgentActionPermission = (typeof AGENT_ACTION_PERMISSIONS)[number];

export interface AgentPermissionSettings {
  updateWithoutApproval?: boolean;
  deleteWithoutApproval?: boolean;
  sendMessagesWithoutApproval?: boolean;
}

export const DEFAULT_AGENT_PERMISSIONS = {
  updateWithoutApproval: true,
  deleteWithoutApproval: false,
  sendMessagesWithoutApproval: false,
  spendWithoutApproval: false,
} as const;

const PERMISSION_BY_TOOL: Record<string, AgentActionPermission> = {
  github_repo_inspect: "read",
  vercel_deployment_inspect: "read",
  workspace_readiness_inspect: "read",
  studio_asset_list: "read",
  connector_catalog: "read",
  connector_status: "read",
  connector_read: "read",
  connector_link: "read",
  github_repo_probe: "read",
  load_skill: "read",
  project_document_create: "update",
  browser_task_run: "update",
  studio_image_edit: "update",
  studio_background_remove: "update",
  studio_video_render: "update",
  studio_promo_video: "update",
  studio_ai_generate: "spend",
  studio_narration: "update",
  studio_audio_edit: "update",
};

const DESCRIPTIONS: Record<string, Omit<ToolCatalogEntry, "id" | "permission">> = {
  load_skill: {
    summary: "Reads the instructions for an enabled skill in this workspace.",
    writes: false,
  },
  github_repo_inspect: {
    summary: "Reads a repository's branches, recent commits and open pull requests.",
    writes: false,
  },
  github_repo_probe: {
    summary: "Checks whether a named workspace GitHub credential can access an allowlisted repository; does not inspect files.",
    writes: false,
  },
  vercel_deployment_inspect: {
    summary: "Reads a project's latest deployment status and build result.",
    writes: false,
  },
  workspace_readiness_inspect: {
    summary: "Reads what this workspace has connected and what is still missing.",
    writes: false,
  },
  studio_asset_list: {
    summary: "Lists the media already stored for this workspace.",
    writes: false,
  },
  connector_catalog: {
    summary: "Lists the connectors this workspace can read from.",
    writes: false,
  },
  connector_read: {
    summary: "Reads from a connector this workspace has authorised.",
    writes: false,
  },
  project_document_create: {
    summary: "Writes a project document into the workspace.",
    writes: true,
  },
  browser_task_run: {
    summary: "Drives a browser session, which can submit forms and change external accounts.",
    writes: true,
  },
  studio_image_edit: {
    summary: "Produces a new edited image and stores it.",
    writes: true,
  },
  studio_background_remove: {
    summary: "Produces a new image with the background removed and stores it.",
    writes: true,
  },
  studio_video_render: {
    summary: "Renders a video and stores it.",
    writes: true,
  },
  studio_promo_video: {
    summary: "Renders a promotional video and stores it.",
    writes: true,
  },
  studio_ai_generate: {
    summary: "Calls a model to generate media and stores the result.",
    writes: true,
  },
  studio_narration: {
    summary: "Produces a narration track and stores it.",
    writes: true,
  },
  studio_audio_edit: {
    summary: "Produces an edited audio track and stores it.",
    writes: true,
  },
};

export function toolCatalog(): ToolCatalogEntry[] {
  return Object.keys(WORKER_TOOLS)
    .sort()
    .map((id) => ({
      id,
      summary: DESCRIPTIONS[id]?.summary ?? "Reads data this workspace has authorised.",
      // Unknown tools are assumed to write. Every entry above is declared
      // explicitly; the fallback only catches a tool added without a description,
      // and guessing "read-only" for it would let an approval gate skip a write.
      writes: DESCRIPTIONS[id]?.writes ?? true,
      permission: PERMISSION_BY_TOOL[id] ?? "spend",
    }));
}

function browserPermissions(payload: Record<string, unknown> | undefined): AgentActionPermission[] {
  const steps = payload?.steps;
  if (!Array.isArray(steps)) {
    return [];
  }

  const permissions = steps.flatMap((step): AgentActionPermission[] => {
    if (!step || typeof step !== "object") {
      return [];
    }
    const record = step as Record<string, unknown>;
    const values = [record.action, record.kind, record.category, record.operation]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());
    const result: AgentActionPermission[] = [];
    if (
      values.some((value) =>
        ["purchase", "payment", "spend", "security_change", "submit", "submit_final", "click"].includes(value)
      )
    ) {
      result.push("spend");
    }
    if (values.some((value) => ["publish", "message", "send", "submit"].includes(value))) {
      result.push("send");
    }
    if (values.includes("delete")) {
      result.push("delete");
    }
    if (values.some((value) => ["type", "select"].includes(value))) {
      result.push("update");
    }
    if (values.some((value) => ["navigate", "read", "screenshot", "scroll"].includes(value))) {
      result.push("read");
    }
    return result.length > 0 ? result : ["spend"];
  });

  return [...new Set(permissions)];
}

export function permissionsForTool(
  tool: string,
  payload?: Record<string, unknown>
): AgentActionPermission[] {
  if (tool === "browser_task_run") {
    const permissions = browserPermissions(payload);
    if (permissions.length > 0) {
      return permissions;
    }
  }
  return [PERMISSION_BY_TOOL[tool] ?? "spend"];
}

export function permissionForTool(
  tool: string,
  payload?: Record<string, unknown>
): AgentActionPermission {
  return permissionsForTool(tool, payload)[0];
}

export function permissionNeedsApproval(
  permission: AgentActionPermission,
  settings: AgentPermissionSettings | null | undefined
): boolean {
  if (permission === "update") {
    return !(settings?.updateWithoutApproval ?? DEFAULT_AGENT_PERMISSIONS.updateWithoutApproval);
  }
  if (permission === "delete") {
    return !(settings?.deleteWithoutApproval ?? DEFAULT_AGENT_PERMISSIONS.deleteWithoutApproval);
  }
  if (permission === "send") {
    return !(settings?.sendMessagesWithoutApproval ?? DEFAULT_AGENT_PERMISSIONS.sendMessagesWithoutApproval);
  }
  return permission === "spend";
}

export function permissionsRequiringApproval(
  tool: string,
  payload: Record<string, unknown> | undefined,
  settings: AgentPermissionSettings | null | undefined
): AgentActionPermission[] {
  return permissionsForTool(tool, payload).filter((permission) => permissionNeedsApproval(permission, settings));
}

export function isKnownTool(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORKER_TOOLS, id);
}

export type ToolSelectionResult = { ok: true; tools: string[] | null } | { ok: false; error: string };

/**
 * Validates a tool selection.
 *
 * `null` clears the restriction and means "every tool the platform supports". An explicit
 * empty array is refused rather than stored: an agent permitted to run nothing will fail at
 * the first task, and the reason would be invisible in the UI.
 */
export function validateToolSelection(input: unknown): ToolSelectionResult {
  if (input === null) return { ok: true, tools: null };
  if (!Array.isArray(input)) return { ok: false, error: "allowed_tools_must_be_an_array" };
  if (input.length === 0) return { ok: false, error: "allowed_tools_empty" };
  if (input.length > 32) return { ok: false, error: "allowed_tools_too_many" };

  const cleaned: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") return { ok: false, error: "allowed_tools_must_be_strings" };
    const id = entry.trim();
    if (!isKnownTool(id)) return { ok: false, error: `unknown_tool:${id}` };
    if (!cleaned.includes(id)) cleaned.push(id);
  }
  return { ok: true, tools: cleaned };
}

/**
 * Whether this agent's configuration permits the tool.
 *
 * Used at task creation, which is the point where an unauthorised assignment would otherwise
 * only surface mid-execution. An agent with no restriction may run any supported tool; that
 * is the documented default, not an accidental bypass.
 */
/**
 * How a stored tool assignment should be read.
 *
 * There are four distinct states and they must not collapse into each other:
 *
 *   `NULL`        predates tool assignment. Those identities were created when every tool was available,
 *                 so they keep that behaviour, reported as `legacy_unrestricted`, never as a normal config.
 *   an array      a real selection. An empty one permits nothing.
 *   anything else a malformed stored value. Permits nothing.
 *   `undefined`   the field was never loaded. This is not a policy, it is a missing read, and it must not be
 *                 mistaken for `NULL`. An earlier version of this file called both "unrestricted", which is
 *                 how an agent with an explicit allowlist came to run tools it was never assigned.
 */
export function describeToolAssignment(agent: { allowedTools?: unknown }): {
  mode: "restricted" | "legacy_unrestricted" | "unreadable";
  tools: string[];
} {
  if (!agent || typeof agent !== "object") return { mode: "unreadable", tools: [] };
  const raw = agent.allowedTools;
  // Absent means the load did not carry the policy. Deny rather than inherit a permissive default.
  if (raw === undefined) return { mode: "unreadable", tools: [] };
  // An explicit NULL is the only path to unrestrained behaviour, and it is reported as legacy.
  if (raw === null) return { mode: "legacy_unrestricted", tools: [] };
  if (!Array.isArray(raw)) return { mode: "restricted", tools: [] };
  return { mode: "restricted", tools: raw.filter((tool): tool is string => typeof tool === "string") };
}

export function agentAllowsTool(agent: { allowedTools?: unknown } | null, tool: string): boolean {
  // No identity is no permission. This used to return true, which made every caller that lost its
  // agent object silently unrestricted.
  if (!agent) return false;
  const policy = describeToolAssignment(agent);
  if (policy.mode === "legacy_unrestricted") return true;
  if (policy.mode === "unreadable") return false;
  return policy.tools.includes(tool);
}
