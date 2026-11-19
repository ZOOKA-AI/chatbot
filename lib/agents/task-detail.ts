import "server-only";

import { describeExecution, executionLine, summariseEvidence, type ExecutionView } from "./execution-progress";

/**
 * The single shape a chat message, a task page and a history row all read.
 *
 * Assembling it in one place is what stops the three surfaces from disagreeing: the chat
 * used to describe a run from the task status while the history page described it from
 * the execution row, so a task whose execution had failed could read as "running" in one
 * place and "failed" in another.
 */

export type TaskForDetail = {
  id: string;
  title: string;
  status: string;
  attempts?: number | null;
  maxAttempts?: number | null;
  approvalRequired?: boolean | null;
  createdAt?: Date | string | null;
};

export type ExecutionForDetail = {
  status: string;
  tool?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  leaseExpiresAt?: Date | string | null;
  resultSummary?: unknown;
  evidenceRef?: string | null;
  error?: string | null;
  attempt?: number | null;
  durationMs?: number | null;
};

export type TaskDetail = {
  task: { id: string; title: string; status: string; attempts: number; maxAttempts: number };
  progress: ExecutionView;
  line: string;
  evidence: { present: boolean; tool: string | null; reference: string | null; summary: unknown; size: number | null };
  timing: { startedAt: string | null; finishedAt: string | null; durationMs: number | null };
  error: string | null;
};

/**
 * `execution` is the newest attempt, or null when nothing has ever tried to run this task.
 * Both cases are meaningful: null means queued, not missing.
 */
export function buildTaskDetail(
  task: TaskForDetail,
  execution: ExecutionForDetail | null,
  now: Date = new Date()
): TaskDetail {
  const evidenceValue = execution?.resultSummary ?? null;
  const summary = summariseEvidence({
    status: execution?.status ?? "pending",
    startedAt: execution?.startedAt ?? null,
    tool: execution?.tool ?? null,
    evidence: evidenceValue,
    error: execution?.error ?? null,
    leaseExpiresAt: execution?.leaseExpiresAt ?? null,
  });

  const progress = describeExecution(
    execution
      ? {
          status: execution.status,
          startedAt: execution.startedAt ?? null,
          finishedAt: execution.finishedAt ?? null,
          tool: execution.tool ?? null,
          evidence: evidenceValue,
          error: execution.error ?? null,
          leaseExpiresAt: execution.leaseExpiresAt ?? null,
        }
      : null,
    {
      status: task.status,
      attempts: task.attempts ?? execution?.attempt ?? 0,
      maxAttempts: task.maxAttempts ?? null,
      approvalRequired: task.approvalRequired ?? null,
    },
    now
  );

  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      attempts: task.attempts ?? execution?.attempt ?? 0,
      maxAttempts: task.maxAttempts ?? 3,
    },
    progress,
    line: executionLine(progress),
    evidence: {
      present: summary.present,
      tool: summary.tool,
      reference: execution?.evidenceRef ?? null,
      summary: evidenceValue,
      size: summary.size,
    },
    timing: {
      startedAt: execution?.startedAt ? new Date(execution.startedAt).toISOString() : null,
      finishedAt: execution?.finishedAt ? new Date(execution.finishedAt).toISOString() : null,
      durationMs: execution?.durationMs ?? null,
    },
    error: execution?.error ?? null,
  };
}
