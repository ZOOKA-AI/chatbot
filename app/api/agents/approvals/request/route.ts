import { hasScope, requestApproval } from "@/lib/agents/command-center";
import {
  badRequest,
  callerOrganizationId,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";

export async function POST(request: Request) {
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

  let payload: { taskId?: unknown; reason?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return badRequest("invalid_json");
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!reason) {
    return badRequest("reason_required");
  }

  const approval = await requestApproval(caller.agent, {
    organizationId: callerOrganizationId(caller),
    taskId: typeof payload.taskId === "string" ? payload.taskId : null,
    reason,
  });

  return json({ approval, status: "pending_owner_decision" }, 201);
}
