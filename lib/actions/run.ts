import "server-only";

import { PLANS, type PlanKey } from "@/lib/billing/entitlements";
import { agentAllowsTool } from "@/lib/agents/agent-tools";
import { createTask } from "@/lib/agents/command-center";
import { getWorkspaceBilling } from "@/lib/db/queries";
import {
  ACTION_CATALOG_VERSION,
  actionPayload,
  findAction,
  parseActionInputs,
  type ActionTemplate,
} from "@/lib/actions/catalog";
import {
  getProject,
  getProjectByName,
  listProjectTasks,
  resolveProjectAgentForTool,
  type ProjectAgentSummary,
} from "@/lib/projects/store";

/**
 * Running a catalog action.
 *
 * The order of refusals matters, because each one protects something the customer set:
 * the template must be executable, the input must match what was declared, the project must
 * be theirs, an agent they assigned to that project must actually hold the tool, and the
 * plan's run allowance must not be spent. Only then is a task created.
 *
 * Nothing here decides the outcome of the work. It creates the task and stops: the worker
 * claims it, runs the tool, and writes the evidence. A run that has not executed shows as
 * pending, which is the honest state.
 */

/**
 * How long an identical request counts as the same request.
 *
 * A double-clicked Run button must not queue the same read twice, but a customer who genuinely
 * wants to re-run an hour later must not be told their work already exists. Five minutes covers
 * the click and nothing else.
 */
export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export type ActionPlanInput = {
  template: ActionTemplate;
  /** The tools the project's agent was explicitly assigned. Null means the legacy unrestricted case. */
  assignedTools: string[] | null;
  agentStatus: string;
  plan: PlanKey;
  agentRunsUsed: number;
};

export type ActionPlan =
  | { ok: true; approvalRequired: boolean; tool: string; legacyUnrestrictedAgent: boolean }
  | { ok: false; error: string; detail?: string };

/**
 * The decision, separated from the database so it can be tested exhaustively.
 *
 * `agentAllowsTool` is the platform's own permission rule rather than a second interpretation
 * of it: whatever the worker route will refuse at execution time is refused here first, with a
 * clearer message, instead of queuing a task that cannot run.
 */
export function planActionExecution(input: ActionPlanInput): ActionPlan {
  const { template } = input;

  if (!template.executable) {
    return { ok: false, error: "action_not_executable" };
  }
  const tool = template.requiredTools[0];
  if (!tool) return { ok: false, error: "action_has_no_tool" };

  if (input.agentStatus !== "active") {
    return { ok: false, error: "assigned_agent_inactive" };
  }

  if (!agentAllowsTool({ allowedTools: input.assignedTools }, tool)) {
    return {
      ok: false,
      error: "tool_not_assigned",
      detail: "The agent assigned to this project does not include this action's tool. An owner can assign it on the agents page.",
    };
  }

  const allowance = (PLANS[input.plan] as { agentRuns?: number }).agentRuns;
  if (allowance === undefined) {
    return {
      ok: false,
      error: "plan_does_not_include_agent_runs",
      detail: "This workspace's plan does not include agent runs.",
    };
  }
  if (input.agentRunsUsed >= allowance) {
    return {
      ok: false,
      error: "run_allowance_exhausted",
      detail: `This workspace has used ${input.agentRunsUsed} of ${allowance} agent runs this month.`,
    };
  }

  return {
    ok: true,
    approvalRequired: template.approval === "required",
    tool,
    legacyUnrestrictedAgent: input.assignedTools === null,
  };
}

export type RunActionInput = {
  organizationId: string;
  actionId: string;
  inputs?: unknown;
  projectId?: string;
  projectName?: string;
  createdBy?: string;
};

export type RunActionResult =
  | {
      ok: true;
      taskId: string;
      status: string;
      approvalRequired: boolean;
      project: { id: string; name: string };
      agent: { id: string; displayName: string; slug: string };
      action: { id: string; version: number; catalogVersion: number };
      tool: string;
      /** True when an identical request was already queued and this is that task, not a new one. */
      deduplicated: boolean;
    }
  | { ok: false; error: string; detail?: unknown; status: number };

export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const template = findAction(input.actionId);
  if (!template) return { ok: false, error: "unknown_action", status: 404 };

  const parsed = parseActionInputs(template, input.inputs);
  if (!parsed.ok) return { ok: false, error: parsed.reason, detail: parsed.detail, status: 400 };

  const project = input.projectId
    ? await getProject({ organizationId: input.organizationId, projectId: input.projectId })
    : input.projectName
      ? await getProjectByName({ organizationId: input.organizationId, name: input.projectName })
      : null;
  if (!project) return { ok: false, error: "project_required", status: 400 };
  if (project.status === "archived") return { ok: false, error: "project_archived", status: 409 };

  const tool = template.requiredTools[0];
  const agent: ProjectAgentSummary | null = await resolveProjectAgentForTool({
    organizationId: input.organizationId,
    projectId: project.id,
    tool,
  });

  const billing = await getWorkspaceBilling(input.organizationId);
  const plan = ((billing.subscription?.plan ?? "free") as PlanKey) ?? "free";

  if (!agent) {
    // No agent on this project holds the tool. Refused rather than reassigned to some other
    // identity in the workspace, which would quietly widen what the customer configured.
    return {
      ok: false,
      error: "no_assigned_agent",
      detail: "Assign an agent with this action's tool to the project before running it.",
      status: 409,
    };
  }

  const plan_ = planActionExecution({
    template,
    assignedTools: agent.allowedTools ?? null,
    agentStatus: agent.status,
    plan,
    agentRunsUsed: billing.usage.agentRuns,
  });
  if (!plan_.ok) return { ok: false, error: plan_.error, detail: plan_.detail, status: 409 };

  const { payload } = actionPayload(template, parsed.inputs);

  // The same request, submitted twice, is one task. The comparison is on the stored payload, so
  // it covers the action and its exact inputs without trusting a client-supplied key.
  const recent = await listProjectTasks({ organizationId: input.organizationId, projectId: project.id, limit: 20 });
  const duplicate = recent.find((row) => {
    const stored = row.payload as { actionId?: string; inputs?: unknown } | null;
    if (!stored || stored.actionId !== template.id) return false;
    if (JSON.stringify(stored.inputs ?? {}) !== JSON.stringify(parsed.inputs)) return false;
    if (!["pending", "claimed", "executing", "running"].includes(row.status)) return false;
    const age = Date.now() - new Date(row.createdAt).getTime();
    return age >= 0 && age < DUPLICATE_WINDOW_MS;
  });
  if (duplicate) {
    return {
      ok: true,
      taskId: duplicate.id,
      status: duplicate.status,
      approvalRequired: duplicate.approvalRequired,
      project: { id: project.id, name: project.name },
      agent: { id: agent.id, displayName: agent.displayName, slug: agent.slug },
      action: { id: template.id, version: template.version, catalogVersion: ACTION_CATALOG_VERSION },
      tool: plan_.tool,
      deduplicated: true,
    };
  }

  const task = await createTask({
    organizationId: input.organizationId,
    title: `${template.title.en}: ${project.name}`.slice(0, 200),
    instruction: [
      `Action ${template.id} v${template.version} (catalog v${ACTION_CATALOG_VERSION}).`,
      `Tool: ${plan_.tool}.`,
      `Inputs: ${JSON.stringify(parsed.inputs)}.`,
      "Report exactly what the tool returned, and change nothing outside this project.",
    ].join(" "),
    ownerAgentId: agent.id,
    projectId: project.id,
    payload: {
      tool: plan_.tool,
      actionId: template.id,
      actionVersion: template.version,
      catalogVersion: ACTION_CATALOG_VERSION,
      inputs: parsed.inputs,
      projectId: project.id,
      ...payload,
    },
    approvalRequired: plan_.approvalRequired,
    createdBy: input.createdBy ?? "owner",
  });

  return {
    ok: true,
    taskId: task.id,
    status: task.status,
    approvalRequired: plan_.approvalRequired,
    project: { id: project.id, name: project.name },
    agent: { id: agent.id, displayName: agent.displayName, slug: agent.slug },
    action: { id: template.id, version: template.version, catalogVersion: ACTION_CATALOG_VERSION },
    tool: plan_.tool,
    deduplicated: false,
  };
}
