import { claimTask, hasScope } from "@/lib/agents/command-center";
import { badRequest, forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "task:claim")) {
    return forbidden("missing_scope:task:claim");
  }

  let payload: { taskId?: unknown };
  try {
    payload = (await request.json()) as { taskId?: unknown };
  } catch {
    return badRequest("invalid_json");
  }

  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  if (!taskId) {
    return badRequest("taskId_required");
  }

  const result = await claimTask(caller.agent, taskId);
  return json(result, result.ok ? 200 : 409);
}
