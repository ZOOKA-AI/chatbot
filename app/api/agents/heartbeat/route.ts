import { hasScope, heartbeat } from "@/lib/agents/command-center";
import { forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "heartbeat")) {
    return forbidden("missing_scope:heartbeat");
  }
  return json(await heartbeat(caller.agent));
}
