import { commandCenterStatus, recentAgentActivity } from "@/lib/agents/command-center";
import {
  callerOrganizationId,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const organizationId = callerOrganizationId(caller);
  const [status, activity] = await Promise.all([
    commandCenterStatus(organizationId),
    recentAgentActivity(organizationId),
  ]);
  return json({ ...status, recent: activity });
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);
