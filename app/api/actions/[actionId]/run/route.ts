import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { runAction } from "@/lib/actions/run";
import { validateJson } from "@/lib/validation/api";

/**
 * Creating the task an action needs, and stopping there.
 *
 * Running spends the workspace's run allowance and queues work an agent will execute, so it
 * needs owner or admin. The response carries the real task id and its real state; a run that
 * has not executed yet says "pending", never "done".
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
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { actionId } = await context.params;
  const parsed = await validateJson(request, body);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);
  if (!parsed.data.projectId && !parsed.data.projectName) {
    return json({ error: "project_required", detail: "A project is required so the work has an owner." }, 400);
  }

  const result = await runAction({
    organizationId: callerOrganizationId(caller),
    actionId,
    inputs: parsed.data.inputs,
    projectId: parsed.data.projectId,
    projectName: parsed.data.projectName,
    createdBy: caller.userId.slice(0, 64),
  });

  if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status);
  return json(result, 201);
}

export const POST = withCommanderTenant(POSTHandler);
