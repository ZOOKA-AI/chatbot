import { cancelTask, getTask } from "@/lib/agents/command-center";
import { buildTaskDetail } from "@/lib/agents/task-detail";
import { executionReport } from "@/lib/agents/worker";
import { z } from "zod";

import {
  badRequest,
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { fields, validateJson } from "@/lib/validation/api";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

/**
 * Reading a task is scoped to the caller's workspace and nothing else. A member may read
 * their own workspace's task; an agent key may not, because the detail includes the
 * evidence and error text of work it did not necessarily perform.
 */
async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }

  const { id } = await params;
  const parsedId = fields.uuid.safeParse(id);
  if (!parsedId.success) {
    return badRequest("invalid_body");
  }

  const organizationId = callerOrganizationId(caller);
  const task = await getTask({ organizationId, taskId: parsedId.data });
  if (!task) {
    // Same answer whether it does not exist or belongs to another workspace.
    return json({ error: "not_found" }, 404);
  }

  const execution = await executionReport(organizationId, parsedId.data);
  return json(buildTaskDetail(task as never, (execution as never) ?? null));
}

/** Cancelling is a human action, like deciding an approval. */
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (!canManage(caller)) {
    return forbidden("owner_or_admin_required");
  }

  const { id } = await params;
  const parsedId = fields.uuid.safeParse(id);
  if (!parsedId.success) {
    return badRequest("invalid_body");
  }

  const parsed = await validateJson(
    request,
    z.object({ reason: fields.reason }).strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }

  const task = await cancelTask({
    organizationId: callerOrganizationId(caller),
    taskId: parsedId.data,
    reason: parsed.data.reason,
    by: `owner:${caller.userId.slice(0, 8)}`,
  });

  if (!task) {
    return json({ error: "not_found" }, 404);
  }
  return json({ task });
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
