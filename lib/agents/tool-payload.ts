import "server-only";

/**
 * The arguments a task's tool is called with, in one place.
 *
 * This exists because of a real failure: the scheduler passed `{ repo }` to
 * `github_repo_inspect` and the standalone worker passed nothing, so every task the worker
 * executed failed with `bad_repo_name` while the scheduler's own runs succeeded. Two
 * callers, two payloads, one of them wrong. A tool that needs an argument now gets it from
 * here, and a task that names nothing gets the same default both paths use.
 */

export type ToolPayload = Record<string, unknown>;

const DEFAULTS: Record<string, ToolPayload> = {
  // The authorised installation scope; the tool refuses anything outside it.
  github_repo_inspect: { repo: "zooka-ai/chatbot" },
  vercel_inspect: {},
};

export function defaultToolPayload(tool: string): ToolPayload {
  return { ...(DEFAULTS[tool] ?? {}) };
}

/**
 * The keys each tool reads out of its payload.
 *
 * A task stores what the action collected (`{ tool, label }`), and whoever executes it has to
 * hand those values through. Passing everything through would let a caller reach parameters a
 * tool never declared, so the merge is limited to this list: the defaults above plus the keys
 * each tool's own run() reads. Without it a label or a brief was silently dropped and the tool
 * failed with "invalid_label" while the value sat in the row.
 */
const ACCEPTED: Record<string, string[]> = {
  github_repo_inspect: ["repo", "paths"],
  vercel_deployment_inspect: ["project"],
  workspace_readiness_inspect: ["label"],
  project_document_create: ["title", "brief", "projectId"],
  browser_task_run: ["startUrl", "steps"],
};

export function acceptedPayloadKeys(tool: string): string[] {
  return [...new Set([...Object.keys(DEFAULTS[tool] ?? {}), ...(ACCEPTED[tool] ?? [])])];
}

/** An explicit payload wins, but only for keys the tool is known to accept. */
export function toolPayloadFor(tool: string, override?: ToolPayload | null): ToolPayload {
  const base = defaultToolPayload(tool);
  if (!override) return base;
  const allowed = new Set(acceptedPayloadKeys(tool));
  const merged: ToolPayload = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (allowed.has(key)) merged[key] = value;
  }
  return merged;
}
