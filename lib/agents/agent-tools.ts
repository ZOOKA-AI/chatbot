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

export type ToolCatalogEntry = {
  id: string;
  /** What it does, in the customer's terms. No capability the tool does not have. */
  summary: string;
  /** Whether running it changes anything outside the workspace. */
  writes: boolean;
};

const DESCRIPTIONS: Record<string, Omit<ToolCatalogEntry, "id">> = {
  github_repo_inspect: {
    summary: "Reads a repository's branches, recent commits and open pull requests.",
    writes: false,
  },
  vercel_deployment_inspect: {
    summary: "Reads a project's latest deployment status and build result.",
    writes: false,
  },
};

export function toolCatalog(): ToolCatalogEntry[] {
  return Object.keys(WORKER_TOOLS)
    .sort()
    .map((id) => ({
      id,
      summary: DESCRIPTIONS[id]?.summary ?? "Reads data this workspace has authorised.",
      writes: DESCRIPTIONS[id]?.writes ?? false,
    }));
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
 * `NULL` predates tool assignment: those identities were created when every tool was available,
 * so they keep that behaviour but are reported as `legacy_unrestricted` rather than passing as a
 * normal configuration. A emptied or malformed selection is `restricted` and permits nothing.
 */
export function describeToolAssignment(agent: { allowedTools?: unknown }): {
  mode: "restricted" | "legacy_unrestricted";
  tools: string[];
} {
  const raw = agent.allowedTools;
  if (raw === null || raw === undefined) return { mode: "legacy_unrestricted", tools: [] };
  if (!Array.isArray(raw)) return { mode: "restricted", tools: [] };
  return { mode: "restricted", tools: raw.filter((tool): tool is string => typeof tool === "string") };
}

export function agentAllowsTool(agent: { allowedTools?: unknown } | null, tool: string): boolean {
  if (!agent) return true;
  const allowed = agent.allowedTools;
  if (allowed === null || allowed === undefined) return true;
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(tool);
}
