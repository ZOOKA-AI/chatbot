import { z } from "zod";

import { hasScope, requestApproval } from "@/lib/agents/command-center";
import {
  badRequest,
  callerOrganizationId,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { fields, validateJson, validateQuery } from "@/lib/validation/api";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "approval:request")) {
    return forbidden("missing_scope:approval:request");
  }

  const parsed = await validateJson(
    request,
    z.object({ taskId: fields.uuid.nullish(), reason: fields.reason }).strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const { reason } = parsed.data;

  const approval = await requestApproval(caller.agent, {
    organizationId: callerOrganizationId(caller),
    taskId: parsed.data.taskId ?? null,
    reason,
  });

  return json({ approval, status: "pending_owner_decision" }, 201);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
