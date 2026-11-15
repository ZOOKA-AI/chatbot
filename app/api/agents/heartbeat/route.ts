import { hasScope, heartbeat } from "@/lib/agents/command-center";
import { forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

async function POSTHandler(request: Request) {
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

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
