import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { assignAgent, listProjectAgents } from "@/lib/projects/store";
import { validateJson } from "@/lib/validation/api";

/**
 * Which agents work on a project.
 *
 * Assignment is explicit because it decides who may take a project's work. The store refuses an
 * agent from another workspace, so this cannot be used to route work to an identity the caller
 * does not control.
 */

type Params = { params: Promise<{ id: string }> };

const body = z.object({ agentId: z.string().uuid() }).strict();

async function GETHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  const { id } = await context.params;
  return json({ agents: await listProjectAgents(callerOrganizationId(caller), id) });
}

async function POSTHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { id } = await context.params;
  const parsed = await validateJson(request, body);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  const assigned = await assignAgent({
    organizationId: callerOrganizationId(caller),
    projectId: id,
    agentId: parsed.data.agentId,
  });
  if (!assigned.ok) return json({ error: assigned.error }, assigned.error === "not_found" ? 404 : 400);
  return json({ ok: true, agents: assigned.agents });
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
