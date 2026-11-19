import {
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { workspaceExecutionHealth } from "@/lib/agents/health";

/**
 * The execution health of one workspace.
 *
 * Owner and admin only: a member cannot act on what this reports, and the queue
 * depth of a workspace is not a member's business. The response is derived
 * entirely from rows, so it cannot claim a worker is fine when its lease says
 * otherwise.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (!canManage(caller)) {
    return forbidden("owner_or_admin_required");
  }

  const health = await workspaceExecutionHealth(callerOrganizationId(caller));
  // 503 when the evidence says execution is not healthy, so a monitor that only
  // reads status codes still sees the problem without parsing the body.
  return json(health, health.verdict === "critical" ? 503 : 200);
}

export const GET = withCommanderTenant(GETHandler);
