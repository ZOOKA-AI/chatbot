import { z } from "zod";

import {
  badRequest,
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { rotateAgentKey } from "@/lib/agents/command-center";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { validateJson } from "@/lib/validation/api";

/**
 * A replacement key for an existing agent.
 *
 * Management action, owner or admin only: the agent itself may never rotate its own credential,
 * for the same reason it may not edit its scopes. The workspace is taken from the session, so a
 * body naming another tenant's agent id matches no row and changes nothing.
 */

const bodySchema = z
  .object({
    agentId: z.string().uuid(),
  })
  .strict();

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return forbidden("owner_or_admin_required");

  const parsed = await validateJson(request, bodySchema);
  if (!parsed.ok) return badRequest(parsed.reason);

  const rotated = await rotateAgentKey({
    organizationId: callerOrganizationId(caller),
    agentId: parsed.data.agentId,
  });
  if (!rotated) {
    return json({ error: "agent_not_found" }, 404);
  }

  return json({
    agent: rotated.agent,
    key: rotated.key,
    warning: "store_this_key_now_it_is_never_returned_again",
  });
}

export const POST = withCommanderTenant(POSTHandler);
