import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { ACTION_CATALOG_VERSION, listActions } from "@/lib/actions/catalog";
import { listProjects, listProjectAgents } from "@/lib/projects/store";

/**
 * The catalog, as this workspace can actually use it.
 *
 * The templates are the same for everyone; what differs per workspace is whether an agent
 * assigned to one of its projects holds the tool an action needs. That is reported as a
 * readiness flag rather than a hidden action, so the customer can see what to fix.
 */

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const organizationId = callerOrganizationId(caller);
  const projects = await listProjects(organizationId, 100);

  const readiness = new Map<string, boolean>();
  for (const project of projects) {
    const agents = await listProjectAgents(organizationId, project.id);
    for (const actionTool of new Set(listActions().flatMap((action) => action.requiredTools))) {
      const able = agents.some((agent) => agent.status === "active" && Array.isArray(agent.allowedTools) && agent.allowedTools.includes(actionTool));
      if (able) readiness.set(actionTool, true);
    }
  }

  const actions = listActions().map((action) => ({
    ...action,
    /** Whether some active agent on some project of this workspace holds the action's tool. */
    ready: action.executable && action.requiredTools.every((tool) => readiness.get(tool) === true),
  }));

  return json({ catalogVersion: ACTION_CATALOG_VERSION, actions, count: actions.length });
}

export const GET = withCommanderTenant(GETHandler);
