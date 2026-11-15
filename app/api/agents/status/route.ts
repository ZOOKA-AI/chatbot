import { commandCenterStatus, recentAgentActivity } from "@/lib/agents/command-center";
import {
  callerOrganizationId,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";

export async function GET(request: Request) {
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
