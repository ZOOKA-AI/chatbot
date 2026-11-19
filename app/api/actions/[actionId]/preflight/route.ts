import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { preflightAction } from "@/lib/actions/preflight";
import { findAction, parseActionInputs } from "@/lib/actions/catalog";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getProject, getProjectByName, resolveProjectAgentForTool } from "@/lib/projects/store";
import { validateJson } from "@/lib/validation/api";
import type { PlanKey } from "@/lib/billing/entitlements";

/**
 * The answer to "what happens if I run this", before anything is queued.
 *
 * Read-only by construction: it loads the same project, agent and billing state the run route
 * loads, asks preflightAction for a decision, and returns it. It creates no task, spends no run
 * allowance, and writes nothing. The refusals are the run route's refusals, produced by the same
 * function, so a green answer here means the run will not be refused for those reasons.
 *
 * It is deliberately not a second source of truth: everything it reports comes from
 * planActionExecution through preflightAction, and the ordering below mirrors the run route so a
 * caller cannot learn a different story from the two endpoints.
 */

type Params = { params: Promise<{ actionId: string }> };

const body = z
  .object({
    projectId: z.string().uuid().optional(),
    projectName: z.string().min(2).max(200).optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

async function POSTHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  // Same audience as the run route: this describes a run, so it is answered to whoever could
  // have started one. A member who cannot run the action does not get to plan it either.
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { actionId } = await context.params;
  const parsed = await validateJson(request, body);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);
  if (!parsed.data.projectId && !parsed.data.projectName) {
    return json({ error: "project_required", detail: "A project is required so the work has an owner." }, 400);
  }

  const organizationId = callerOrganizationId(caller);

  const template = findAction(actionId);
  if (!template) return json({ error: "unknown_action" }, 404);

  const inputs = parseActionInputs(template, parsed.data.inputs);
  if (!inputs.ok) return json({ error: inputs.reason, detail: inputs.detail }, 400);

  const project = parsed.data.projectId
    ? await getProject({ organizationId, projectId: parsed.data.projectId })
    : await getProjectByName({ organizationId, name: parsed.data.projectName as string });
  if (!project) return json({ error: "project_required" }, 400);
  if (project.status === "archived") return json({ error: "project_archived" }, 409);

  const agent = await resolveProjectAgentForTool({
    organizationId,
    projectId: project.id,
    tool: template.requiredTools[0],
  });
  if (!agent) {
    return json(
      {
        error: "no_assigned_agent",
        detail: "Assign an agent with this action's tool to the project before running it.",
      },
      409
    );
  }

  const billing = await getWorkspaceBilling(organizationId);
  const plan = ((billing.subscription?.plan ?? "free") as PlanKey) ?? "free";

  const decision = preflightAction({
    template,
    assignedTools: agent.allowedTools,
    agentStatus: agent.status,
    plan,
    agentRunsUsed: billing.usage.agentRuns,
    organizationId,
    inputs: inputs.inputs,
  });

  if (decision.decision === "deny") {
    return json({ decision: "deny", error: decision.error, detail: decision.detail }, 409);
  }

  return json({
    decision: decision.decision,
    risk: decision.risk,
    reasons: decision.reasons,
    cost: decision.cost,
    idempotencyKey: decision.idempotencyKey,
    action: { id: template.id, version: template.version },
    project: { id: project.id, name: project.name },
    agent: { id: agent.id, displayName: agent.displayName, slug: agent.slug },
  });
}

export const POST = withCommanderTenant(POSTHandler);
