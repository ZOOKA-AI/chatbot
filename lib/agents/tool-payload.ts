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

/** An explicit payload wins, but only for keys the tool is known to accept. */
export function toolPayloadFor(tool: string, override?: ToolPayload | null): ToolPayload {
  const base = defaultToolPayload(tool);
  if (!override) return base;
  const merged: ToolPayload = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key in base) merged[key] = value;
  }
  return merged;
}
