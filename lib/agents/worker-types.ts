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
  /** The task being executed, so an artifact can be traced back to the run that produced it. */
  taskId?: string | null;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
};

export type WorkerTool = {
  name: string;
  /** A tool that is not read-only cannot be run by this worker at all. */
  readOnly: boolean;
  /**
   * Writes only to this platform's own tables, inside the caller's workspace, and nowhere else.
   * Such a tool still needs to be named in INTERNAL_WRITE_TOOLS: the flag alone grants nothing.
   */
  internalWrite?: boolean;
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

/**
 * The only non-read-only tools the worker may run.
 *
 * A write tool is a much larger promise than a read tool, so this is an explicit list rather than
 * a flag a tool can set for itself: a tool that sets `internalWrite` but is missing here is still
 * refused, and the worker's default stays "refuse anything that writes".
 */
export const INTERNAL_WRITE_TOOLS = new Set<string>([
  "project_document_create",
  "browser_task_run",
  // The studio creates files and rows, so each of these is named rather than granted by a flag.
  "studio_image_edit",
  "studio_background_remove",
  "studio_video_render",
  "studio_narration",
  "studio_audio_edit",
]);
