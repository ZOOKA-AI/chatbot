import { claimTask, hasScope } from "@/lib/agents/command-center";
import { z } from "zod";

import { badRequest, forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { fields, validateJson } from "@/lib/validation/api";

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

  const parsed = await validateJson(request, z.object({ taskId: fields.uuid }).strict());
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const { taskId } = parsed.data;

  const result = await claimTask(caller.agent, taskId);
  return json(result, result.ok ? 200 : 409);
}
