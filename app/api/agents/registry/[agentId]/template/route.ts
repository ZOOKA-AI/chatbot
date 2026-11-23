import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { createAgentTemplateLink, revokeAgentTemplateLink } from "@/lib/agents/templates";

type Params = { params: Promise<{ agentId: string }> };
const uuid = z.string().uuid();

async function POSTHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { agentId } = await context.params;
  if (!uuid.safeParse(agentId).success) return json({ error: "not_found" }, 404);

  const link = await createAgentTemplateLink({
    organizationId: callerOrganizationId(caller),
    agentId,
  });
  if (!link) return json({ error: "not_found" }, 404);
  return json({ url: `/templates/${link.token}` }, 201);
}

async function DELETEHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { agentId } = await context.params;
  if (!uuid.safeParse(agentId).success) return json({ error: "not_found" }, 404);

  const revoked = await revokeAgentTemplateLink({
    organizationId: callerOrganizationId(caller),
    agentId,
  });
  if (!revoked) return json({ error: "not_found" }, 404);
  return json({ revoked: true });
}

export const POST = withCommanderTenant(POSTHandler);
export const DELETE = withCommanderTenant(DELETEHandler);
