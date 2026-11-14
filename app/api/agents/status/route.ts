import { commandCenterStatus, recentAgentActivity } from "@/lib/agents/command-center";
import { json, resolveCaller, unauthorized } from "@/lib/agents/auth";

export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const [status, activity] = await Promise.all([
    commandCenterStatus(),
    recentAgentActivity(),
  ]);
  return json({ ...status, recent: activity });
}
