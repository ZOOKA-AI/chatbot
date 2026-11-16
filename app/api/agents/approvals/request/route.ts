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
    z
      .object({
        // AgentTask.id is a uuid with a foreign key, so anything else is a body
        // error, not a lookup miss.
        taskId: fields.uuid.nullish(),
        reason: fields.reason.optional(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const { reason } = parsed.data;

  // The reason rule belongs to the domain, so a missing reason answers the
  // specific code instead of a generic body rejection. Approval stays
  // optional-reason deliberately: refusing always needs a written reason,
  // granting does not.
  if (!reason) {
    return badRequest("reason_required");
  }

  const approval = await requestApproval(caller.agent, {
    organizationId: callerOrganizationId(caller),
    taskId: parsed.data.taskId ?? null,
    reason,
  });

  return json({ approval, status: "pending_owner_decision" }, 201);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
