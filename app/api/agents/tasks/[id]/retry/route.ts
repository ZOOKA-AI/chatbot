import { z } from "zod";

import { badRequest, canManage, forbidden, json, resolveCaller, unauthorized, callerOrganizationId } from "@/lib/agents/auth";
import { retryTask } from "@/lib/agents/command-center";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { fields, validateJson } from "@/lib/validation/api";

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  // A retry re-opens work, which is a management action. An agent key holding
  // task:claim still cannot do it: an agent must not resurrect its own failure.
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

  const result = await retryTask({
    organizationId: callerOrganizationId(caller),
    taskId: parsedId.data,
    // canManage above narrows the caller to an owner, so this is a signed-in human.
    by: caller.userId,
    reason: parsed.data.reason,
  });

  if (result.ok) {
    return json({ task: result.task }, 200);
  }

  const status =
    result.error === "task_not_found"
      ? 404
      : result.error === "approval_rejected"
        ? 409
        : 409;
  return json({ reason: result.error }, status);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
