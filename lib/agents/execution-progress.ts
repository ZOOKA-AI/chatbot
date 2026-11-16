import "server-only";

/**
 * What a user may be told about a task, derived only from rows.
 *
 * Two rules, both learned the hard way in this codebase:
 *
 * 1. A status string is not progress. `succeeded` with no evidence and `succeeded` with a
 *    recorded tool result look identical in the database and mean different things to a
 *    person deciding whether to trust the work, so they are reported differently.
 * 2. An expired lease is its own state. Calling it "running" hides that nothing is
 *    heartbeating; calling it "failed" claims knowledge of an outcome nobody has.
 *
 * Every stage below maps to status values that the worker and scheduler actually write
 * (`pending`, `running`, `completed`, `succeeded`, `failed`, `timed_out`, `cancelled`,
 * `blocked`, `awaiting_approval`). Nothing is inferred from timing alone.
 */

export type ExecutionStage =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "blocked"
  | "stalled";

export type ExecutionRecord = {
  status: string;
  startedAt: Date | string | null;
  finishedAt?: Date | string | null;
  tool?: string | null;
  evidence?: unknown;
  error?: string | null;
  attempts?: number | null;
  leaseExpiresAt?: Date | string | null;
};

export type TaskRecord = {
  status: string;
  attempts?: number | null;
  maxAttempts?: number | null;
  approvalRequired?: boolean | null;
};

export type EvidenceSummary = {
  present: boolean;
  tool: string | null;
  /** Number of recorded steps or result keys, when the evidence is shaped like that. */
  size: number | null;
  error: string | null;
};

export type ExecutionView = {
  stage: ExecutionStage;
  label: string;
  /** Plain-language next step, or null when there is nothing for the reader to do. */
  hint: string | null;
  evidence: EvidenceSummary;
  evidenceVerified: boolean;
  canRetry: boolean;
  canCancel: boolean;
  retryReason: string | null;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const SUCCESS = new Set(["completed", "succeeded"]);

function asTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function leaseExpired(execution: ExecutionRecord, now: Date): boolean {
  const expiry = asTime(execution.leaseExpiresAt);
  return expiry !== null && expiry < now.getTime();
}

export function summariseEvidence(execution: ExecutionRecord | null): EvidenceSummary {
  const evidence = execution?.evidence;
  const tool = execution?.tool ?? null;
  const error = execution?.error ?? null;

  if (evidence === null || evidence === undefined) {
    return { present: false, tool, size: null, error };
  }
  if (typeof evidence === "string") {
    const trimmed = evidence.trim();
    return { present: trimmed.length > 0, tool, size: trimmed.length || null, error };
  }
  if (Array.isArray(evidence)) {
    return { present: evidence.length > 0, tool, size: evidence.length, error };
  }
  if (typeof evidence === "object") {
    const keys = Object.keys(evidence as object);
    return { present: keys.length > 0, tool, size: keys.length, error };
  }
  return { present: true, tool, size: null, error };
}

function view(partial: Omit<ExecutionView, "evidenceVerified"> & { evidence: EvidenceSummary }): ExecutionView {
  return { ...partial, evidenceVerified: partial.evidence.present };
}

export function describeExecution(
  execution: ExecutionRecord | null,
  task: TaskRecord,
  now: Date = new Date()
): ExecutionView {
  const attempts = task.attempts ?? execution?.attempts ?? 0;
  const maxAttempts = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attemptsLeft = attempts < maxAttempts;
  const evidence = summariseEvidence(execution);
  const retryReason = attemptsLeft
    ? `${maxAttempts - attempts} attempt(s) left`
    : "Retries are exhausted, so a retry needs a deliberate decision";

  // A decision the reader owns comes before everything except cancellation: it is the
  // only stage where the task is waiting on a human rather than on a machine.
  if (task.status === "awaiting_approval" || task.approvalRequired) {
    return view({
      stage: "awaiting_approval",
      label: "Waiting for approval",
      hint: "Somebody with owner or admin rights has to approve or reject this.",
      evidence,
      canRetry: false,
      canCancel: true,
      retryReason: null,
    });
  }

  if (task.status === "cancelled" || execution?.status === "cancelled") {
    return view({
      stage: "cancelled",
      label: "Cancelled",
      hint: null,
      evidence,
      canRetry: attemptsLeft,
      canCancel: false,
      retryReason,
    });
  }

  if (task.status === "blocked" || execution?.status === "blocked") {
    return view({
      stage: "blocked",
      label: "Blocked: a policy or permission stopped it",
      hint: evidence.error ?? "The refusal reason is recorded on the execution.",
      evidence,
      canRetry: false,
      canCancel: true,
      retryReason: "A retry would hit the same refusal until the cause is changed",
    });
  }

  if (!execution) {
    return view({
      stage: "queued",
      label: task.status === "pending" ? "Queued" : "No execution recorded yet",
      hint: task.status === "pending" ? "A worker will claim this on its next poll." : null,
      evidence,
      canRetry: false,
      canCancel: task.status === "pending",
      retryReason,
    });
  }

  const running = task.status === "running" || execution.status === "running" || execution.status === "claimed";
  if (running && leaseExpired(execution, now)) {
    return view({
      stage: "stalled",
      label: "Stalled: the worker stopped reporting",
      hint: attemptsLeft
        ? "The lease expired. It will be reclaimed and retried automatically."
        : "The lease expired and no attempts are left, so someone has to decide.",
      evidence,
      canRetry: attemptsLeft,
      canCancel: true,
      retryReason,
    });
  }

  if (execution.status === "timed_out" || task.status === "timed_out") {
    return view({
      stage: "timed_out",
      label: "Timed out",
      hint: "The worker ran out of time. Partial evidence, if any, is below.",
      evidence,
      canRetry: attemptsLeft,
      canCancel: false,
      retryReason,
    });
  }

  if (execution.status === "failed" || task.status === "failed") {
    return view({
      stage: "failed",
      label: evidence.present ? "Failed, with partial evidence" : "Failed",
      hint: evidence.error,
      evidence,
      canRetry: attemptsLeft,
      canCancel: false,
      retryReason,
    });
  }

  if (SUCCESS.has(execution.status) || SUCCESS.has(task.status)) {
    return view({
      stage: "completed",
      label: evidence.present
        ? "Completed, evidence recorded"
        : "Reported completed, but no evidence was recorded",
      hint: evidence.present ? null : "Nothing in the record proves the tool ran, so treat this as unverified.",
      evidence,
      canRetry: false,
      canCancel: false,
      retryReason: null,
    });
  }

  if (running) {
    return view({
      stage: "running",
      label: execution.tool ? `Running ${execution.tool}` : "Claimed by a worker",
      hint: null,
      evidence,
      canRetry: false,
      canCancel: true,
      retryReason: null,
    });
  }

  return view({
    stage: "queued",
    label: "Queued",
    hint: null,
    evidence,
    canRetry: false,
    canCancel: task.status === "pending",
    retryReason,
  });
}

/** The one line a chat message can show without misrepresenting the run. */
export function executionLine(view: ExecutionView): string {
  switch (view.stage) {
    case "queued":
      return `${view.label}. A worker will pick it up.`;
    case "running":
      return `${view.label}.`;
    case "awaiting_approval":
      return "Waiting for approval before it can run.";
    case "completed":
      return view.evidenceVerified ? `Completed. ${view.evidence.tool ? `${view.evidence.tool} ` : ""}evidence is recorded.` : "Reported completed, but no evidence was recorded.";
    case "failed":
      return view.evidence.error ? `Failed: ${view.evidence.error}` : "Failed.";
    case "timed_out":
      return "Timed out before finishing.";
    case "cancelled":
      return "Cancelled.";
    case "blocked":
      return `Blocked. ${view.hint ?? ""}`.trim();
    case "stalled":
      return "Stalled: the worker stopped reporting.";
  }
}
