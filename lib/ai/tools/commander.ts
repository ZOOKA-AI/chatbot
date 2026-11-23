import { tool } from "ai";
import { z } from "zod";

import { withCommanderScope } from "@/lib/agents/commander-scope";
import { createTask, getTask, listTasks } from "@/lib/agents/command-center";
import { executionReport } from "@/lib/agents/worker";

/**
 * The bridge between a conversation and real work.
 *
 * The rule this file exists to enforce: a sentence in the chat is not a result.
 * The model may create a task and read its true state, and that is all. There is
 * no tool here that marks a task complete, records a report, or writes a
 * decision, because completion has to come from an agent that actually ran and
 * from the approval gate that authorised it. A model with no completion tool
 * cannot invent a completion.
 *
 * Consequences the model is told about explicitly, in the tool descriptions:
 * creating a task returns `queued`, never `done`, and reading a task reports what
 * the database says even when that disagrees with what the conversation implies.
 */
export function createCommanderTools(input: {
  organizationId: string;
  userId: string;
  canManage: boolean;
}) {
  const createdBy = `user:${input.userId.slice(0, 8)}`;

  /** Every task read goes through the tenant scope, never the shared handle. */
  const scoped = <T,>(work: () => Promise<T>) => withCommanderScope(input.organizationId, work, input.userId);

  return {
    createExecutionTask: tool({
      description:
        "Put real work into this workspace's execution queue, where an agent claims and runs it. Use it whenever the user asks for something to be done rather than explained. It returns the created task's id and its true status, which is always 'pending' at this point: nothing has run yet, so never report the work as finished after calling this. Tell the user the task is queued and give them the id.",
      inputSchema: z.object({
        title: z.string().min(3).max(200).describe("Short imperative title, e.g. 'Run the test suite'"),
        instruction: z
          .string()
          .min(10)
          .max(4000)
          .describe("What must be done, precisely enough for another agent to execute without asking"),
        priority: z.enum(["low", "normal", "high", "critical"]).optional(),
        approvalRequired: z
          .boolean()
          .optional()
          .describe("True for anything that changes production, spends money or touches credentials"),
      }),
      execute: async ({
        title,
        instruction,
        priority,
        approvalRequired,
      }: {
        title: string;
        instruction: string;
        priority?: "low" | "normal" | "high" | "critical";
        approvalRequired?: boolean;
      }) => {
        if (!input.canManage) {
          return {
            ok: false,
            error:
              "Only the workspace owner or an admin can create execution tasks. Explain this to the user; do not claim the work was queued.",
          };
        }
        const task = await scoped(() =>
          createTask({
            organizationId: input.organizationId,
            title,
            instruction,
            priority: priority ?? "normal",
            approvalRequired: approvalRequired ?? false,
            createdBy,
          })
        );
        return {
          ok: true,
          taskId: task.id,
          status: task.status,
          approvalRequired: task.approvalRequired,
          // Spelled out so the model has no room to describe this as finished.
          note: task.approvalRequired
            ? "Queued and gated: it will not run until an owner or admin approves it in the Commander approvals screen."
            : "Queued. No agent has run it yet; this status comes from the database.",
        };
      },
    }),

    getExecutionStatus: tool({
      description:
        "Read the true current state of one execution task from the database. Use it before telling the user whether their work is done, failed, blocked or still waiting, and quote the status you were given rather than the one you expected.",
      inputSchema: z.object({
        taskId: z.string().uuid().describe("The task id returned by createExecutionTask"),
      }),
      execute: async ({ taskId }: { taskId: string }) => {
        const task = await scoped(() => getTask({ organizationId: input.organizationId, taskId }));
        if (!task) {
          return {
            ok: false,
            error:
              "No such task in this workspace. Say you cannot find it; do not guess a status.",
          };
        }
        // Same scope as the task read above. The first version called this on the
        // shared handle, which is a cross-tenant read in production and a hard
        // failure under enforced row-level security.
        const run = await scoped(() => executionReport(input.organizationId, task.id));
        return {
          ok: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          lastExecution: run,
          ownerAgentId: task.ownerAgentId,
          reportedAt: task.reportedAt,
          lastError: (task as { error?: string | null }).error ?? null,
          approvalRequired: task.approvalRequired,
          // The one honest sentence about completion available to the model.
          completion:
            task.status === "completed" && run?.status === "succeeded"
              ? "Recorded as completed, with a verified tool execution behind it."
              : task.status === "completed"
                ? "Marked completed, but no successful execution is recorded: treat this as unverified and say so."
                : "Not completed. This is the database's own status.",
        };
      },
    }),

    listExecutionTasks: tool({
      description:
        "List this workspace's recent execution tasks, newest first. Use it when the user asks what is running, what failed, or what is waiting for approval.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "in_progress", "completed", "failed", "blocked"])
          .optional()
          .describe("Optional filter by state"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ status, limit }: { status?: string; limit?: number }) => {
        const tasks = await scoped(() =>
          listTasks({ organizationId: input.organizationId, status, limit: limit ?? 10 })
        );
        return {
          ok: true,
          count: tasks.length,
          tasks: tasks.map((task) => ({
            taskId: task.id,
            title: task.title,
            status: task.status,
            createdAt: task.createdAt,
            reportedAt: task.reportedAt,
          })),
        };
      },
    }),
  };
}
