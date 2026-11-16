/**
 * The worker's contracts, kept apart from the worker so the tools and the runner
 * can be imported without a cycle.
 */

export type WorkerToolResult =
  | { ok: true; summary: string; evidence: unknown }
  | { ok: false; summary: string; error: string };

export type WorkerToolContext = {
  organizationId: string;
  agentId: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
};

export type WorkerTool = {
  name: string;
  /** A tool that is not read-only cannot be run by this worker at all. */
  readOnly: boolean;
  timeoutMs: number;
  maxAttempts: number;
  description: string;
  run(context: WorkerToolContext): Promise<WorkerToolResult>;
};

const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(?:bearer|token|secret|password|api[_-]?key)\s*[:=]?\s*["']?[A-Za-z0-9._-]{8,}/gi,
];

/** Removes anything that looks like a credential before it can be stored. */
export function redact(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, "[redacted]");
  }
  return output;
}
