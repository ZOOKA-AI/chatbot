import {
  claimTask,
  countExecutions,
  finishExecution,
  getTask,
  latestExecution,
  reportTask,
  requestTaskApproval,
  startExecution,
} from "@/lib/agents/command-center";
import {
  agentAllowsTool,
  permissionsRequiringApproval,
} from "@/lib/agents/agent-tools";
import { githubRepoInspect } from "@/lib/agents/worker-tools/github-inspect";
import { vercelDeploymentInspect } from "@/lib/agents/worker-tools/vercel-inspect";
import { projectDocumentCreate } from "@/lib/agents/worker-tools/project-document";
import { studioPromoVideo } from "@/lib/agents/worker-tools/studio-promo";
import { studioAiGenerate } from "@/lib/agents/worker-tools/studio-ai-generate";
import { workspaceReadinessInspect } from "@/lib/agents/worker-tools/workspace-readiness";
import { HEARTBEAT_MS, heartbeat, idempotencyKey, leaseDeadline } from "@/lib/agents/worker-lease";
import { INTERNAL_WRITE_TOOLS } from "@/lib/agents/worker-types";
import type { WorkerTool } from "@/lib/agents/worker-types";

/**
 * The first real execution worker.
 *
 * It exists to make one sentence true: a task recorded as completed was executed
 * by this runner, with a named tool, and the tool's own answer is what the record
 * contains. Everything else here is in service of that:
 *
 * - the claim is a conditional UPDATE, so two workers cannot run the same task;
 * - a partial unique index refuses a second in-flight attempt even if the
 *   application logic were wrong;
 * - only read-only tools from the registry can run at all;
 * - the tool gets a timeout and an abort signal;
 * - the task is re-read after the tool returns, so a cancellation that arrived
 *   mid-flight wins over the result;
 * - a failure, a timeout or an empty result is reported as failure, never as
 *   completion;
 * - attempts are counted, so a broken task cannot be retried for ever.
 */

type WorkerAgent = {
  id: string;
  organizationId: string;
  /**
   * The agent's stored tool assignment.
   *
   * Required, not optional-by-accident: `runTask` enforces it before claiming, so a caller that forgets to
   * pass it denies instead of running. The HTTP route checks the same policy first for a clean 403; this is
   * the second gate, and it is the one that holds when the queue was filled by something other than the route.
   */
  allowedTools?: unknown;
   updateWithoutApproval?: boolean;
   deleteWithoutApproval?: boolean;
   sendMessagesWithoutApproval?: boolean;
};

import {
  connectorCatalog,
  connectorLink,
  connectorRead,
  connectorStatus,
} from "./worker-tools/connectors";
import { browserTaskRun } from "./worker-tools/browser-task";
import {
  studioAssetList,
  studioAudioEdit,
  studioBackgroundRemove,
  studioImageEdit,
  studioNarration,
  studioVideoRender,
} from "./worker-tools/studio-media";

export const WORKER_TOOLS: Record<string, WorkerTool> = {
  [githubRepoInspect.name]: githubRepoInspect,
  [vercelDeploymentInspect.name]: vercelDeploymentInspect,
  [workspaceReadinessInspect.name]: workspaceReadinessInspect,
  [projectDocumentCreate.name]: projectDocumentCreate,
  browser_task_run: browserTaskRun,
  studio_asset_list: studioAssetList,
  studio_image_edit: studioImageEdit,
  studio_background_remove: studioBackgroundRemove,
  studio_video_render: studioVideoRender,
  studio_promo_video: studioPromoVideo,
  studio_ai_generate: studioAiGenerate,
  studio_narration: studioNarration,
  studio_audio_edit: studioAudioEdit,
  // Connector skills: the chat surface could inspect and call integrations, a
  // queued task could not. Read-only tools, and connector_link returns a path,
  // never a token.
  [connectorCatalog.name]: connectorCatalog,
  [connectorStatus.name]: connectorStatus,
  [connectorRead.name]: connectorRead,
  [connectorLink.name]: connectorLink,
};

export class WorkerRefusal extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WorkerRefusal";
  }
}

export type WorkerOutcome = {
  ok: boolean;
  taskId: string;
  executionId: string | null;
  status: string;
  tool: string;
  error?: string;
  summary?: string;
  /** What the tool produced, so a caller can name the artefact instead of guessing it. */
  evidence?: Record<string, unknown> | null;
};

export async function runTask(
  agent: WorkerAgent,
  input: {
    taskId: string;
    tool: string;
    payload?: Record<string, unknown>;
    fetchImpl?: typeof fetch;
  }
): Promise<WorkerOutcome> {
  const tool = WORKER_TOOLS[input.tool];

  // Second gate. The route already refused a disallowed tool, but the route is not the only way work
  // arrives: a task row inserted straight into the queue reaches this function with no HTTP decision behind
  // it. Enforcing here means the executor, not the caller, owns the answer.
  if (!agentAllowsTool({ allowedTools: agent.allowedTools }, input.tool)) {
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "rejected",
      tool: input.tool,
      error: "tool_not_assigned",
    };
  }

  // Read-only is the default. A writing tool may run only when it is on the explicit internal
  // list and says of itself that it writes nothing but this platform's own tenant-scoped rows.
  const mayRun = Boolean(tool) && (tool.readOnly || (tool.internalWrite === true && INTERNAL_WRITE_TOOLS.has(tool.name)));
  if (!tool || !mayRun) {
    // Refused before any claim: an unknown or writing tool must not take a task.
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "rejected",
      tool: input.tool,
      error: "tool_not_authorized",
    };
  }

  const task = await getTask({ organizationId: agent.organizationId, taskId: input.taskId });
  if (!task) {
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "rejected",
      tool: tool.name,
      error: "task_not_found",
    };
  }

  const effectivePayload =
    input.payload ?? ((task.payload as Record<string, unknown> | null) ?? {});
  const permissions = permissionsRequiringApproval(input.tool, effectivePayload, agent);
  if (permissions.length > 0) {
    const approval = await requestTaskApproval(agent, {
      organizationId: agent.organizationId,
      taskId: input.taskId,
      permissions,
      tool: input.tool,
      payload: effectivePayload,
    });
    if (approval.outcome !== "approved") {
      const error =
        approval.outcome === "rejected"
          ? "approval_rejected"
          : approval.outcome === "not_found"
            ? "task_not_found"
            : approval.outcome === "not_pending"
              ? "task_not_pending"
              : "approval_required";
      return {
        ok: false,
        taskId: input.taskId,
        executionId: null,
        status: approval.outcome === "pending" ? "awaiting_approval" : "rejected",
        tool: input.tool,
        error,
      };
    }
  }

  const attempts = await countExecutions(agent.organizationId, input.taskId);
  const claim = await claimTask(agent as never, input.taskId);
  if (!claim.ok) {
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "rejected",
      tool: tool.name,
      error: claim.error,
    };
  }

  if (attempts >= tool.maxAttempts) {
    // Claimed so that ownership is unambiguous, then blocked rather than retried
    // for ever. Counted attempts include this refusal, so the limit is a ceiling.
    await reportTask(agent as never, {
      taskId: input.taskId,
      status: "blocked",
      evidence: `Retry limit reached: ${attempts} attempt(s) for ${tool.name}. Escalated instead of retried.`,
    });
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "blocked",
      tool: tool.name,
      error: "retry_limit_reached",
    };
  }

  const started = await startExecution({
    organizationId: agent.organizationId,
    taskId: input.taskId,
    agentId: agent.id,
    tool: tool.name,
    attempt: attempts + 1,
    leaseExpiresAt: leaseDeadline(),
    idempotencyKey: idempotencyKey(input.taskId, tool.name, attempts + 1),
  });
  if (!started.ok) {
    // Another worker holds this task. The task stays claimed by that worker and
    // this one writes nothing.
    return {
      ok: false,
      taskId: input.taskId,
      executionId: null,
      status: "rejected",
      tool: tool.name,
      error: started.error,
    };
  }

  const executionId = started.execution.id;
  const beganAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.timeoutMs);
  // Proof of life while the tool works, so a six-second read does not look like
  // a dead worker, and a frozen one stops looking alive within the lease.
  const beat = setInterval(() => {
    void heartbeat(executionId, agent.organizationId).catch(() => {});
  }, HEARTBEAT_MS);

  let aborted = false;
  try {
    const result = await tool.run({
      organizationId: agent.organizationId,
      agentId: agent.id,
      taskId: input.taskId,
      payload: effectivePayload,
      signal: controller.signal,
      fetchImpl: input.fetchImpl ?? fetch,
    });
    const durationMs = Date.now() - beganAt;

    // A cancellation that landed while the tool was working outranks the result.
    const current = await getTask({
      organizationId: agent.organizationId,
      taskId: input.taskId,
    });
    if (current?.status === "cancelled") {
      await finishExecution({
        organizationId: agent.organizationId,
        executionId,
        status: "cancelled",
        durationMs,
        resultSummary: result.summary,
        error: "cancelled_during_execution",
      });
      return {
        ok: false,
        taskId: input.taskId,
        executionId,
        status: "cancelled",
        tool: tool.name,
        error: "cancelled_during_execution",
      };
    }

    if (!result.ok) {
      await finishExecution({
        organizationId: agent.organizationId,
        executionId,
        status: "failed",
        durationMs,
        resultSummary: result.summary,
        error: result.error,
      });
      await reportTask(agent as never, {
        taskId: input.taskId,
        status: "failed",
        evidence: `${tool.name} failed: ${result.error}. ${result.summary}`.slice(0, 4000),
      });
      return {
        ok: false,
        taskId: input.taskId,
        executionId,
        status: "failed",
        tool: tool.name,
        error: result.error,
        summary: result.summary,
      };
    }

    // Success is only ever declared here, with the tool's own answer in hand.
    // Prove we still own this attempt before claiming anything. If recovery has
    // already closed it, this returns null and the worker says so instead of
    // completing work that has been declared abandoned.
    const stillOurs = await heartbeat(executionId, agent.organizationId);
    if (!stillOurs) {
      await finishExecution({
        organizationId: agent.organizationId,
        executionId,
        status: "cancelled",
        durationMs,
        error: "lease_lost",
      }).catch(() => {});
      return {
        ok: false,
        taskId: input.taskId,
        executionId,
        status: "failed",
        tool: tool.name,
        error: "lease_lost",
        summary: "The attempt's lease expired before it could report; recovery owns it now.",
      };
    }

    const evidence = JSON.stringify({ tool: tool.name, summary: result.summary, result: result.evidence }).slice(
      0,
      8000
    );
    const reported = await reportTask(agent as never, {
      taskId: input.taskId,
      status: "completed",
      evidence,
    });
    if (!reported) {
      // The task moved out from under us (cancelled or already settled). The
      // execution is recorded as cancelled; nothing claims a completion.
      await finishExecution({
        organizationId: agent.organizationId,
        executionId,
        status: "cancelled",
        durationMs,
        resultSummary: result.summary,
        error: "task_settled_before_report",
      });
      return {
        ok: false,
        taskId: input.taskId,
        executionId,
        status: "cancelled",
        tool: tool.name,
        error: "task_settled_before_report",
      };
    }

    await finishExecution({
      organizationId: agent.organizationId,
      executionId,
      status: "succeeded",
      durationMs,
      resultSummary: result.summary,
      evidenceRef: `execution:${executionId}`,
    });

    return {
      ok: true,
      taskId: input.taskId,
      executionId,
      status: "completed",
      tool: tool.name,
      /*
       * The tool's own evidence travels back with the answer, not only into the execution row.
       * A caller that receives "it worked" without the artefact id has to guess which asset was made,
       * and guessing is how a result gets attached to the wrong thing.
       */
      evidence: (result.evidence as Record<string, unknown> | undefined) ?? null,
      summary: result.summary,
    };
  } catch (error) {
    const durationMs = Date.now() - beganAt;
    aborted = controller.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    await finishExecution({
      organizationId: agent.organizationId,
      executionId,
      status: aborted ? "timed_out" : "failed",
      durationMs,
      error: aborted ? `timeout_after_${tool.timeoutMs}ms` : message.slice(0, 2000),
    });
    await reportTask(agent as never, {
      taskId: input.taskId,
      status: "failed",
      evidence: aborted
        ? `${tool.name} timed out after ${tool.timeoutMs}ms.`
        : `${tool.name} threw: ${message}`.slice(0, 4000),
    });
    return {
      ok: false,
      taskId: input.taskId,
      executionId,
      status: aborted ? "timed_out" : "failed",
      tool: tool.name,
      error: aborted ? "timeout" : "tool_error",
    };
  } finally {
    clearTimeout(timer);
    clearInterval(beat);
  }
}

/** Where chat and the console read the truth about a task's last attempt. */
export async function executionReport(organizationId: string, taskId: string) {
  const execution = await latestExecution(organizationId, taskId);
  if (!execution) return null;
  return {
    tool: execution.tool,
    attempt: execution.attempt,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    resultSummary: execution.resultSummary,
    evidenceRef: execution.evidenceRef,
    error: execution.error,
  };
}
