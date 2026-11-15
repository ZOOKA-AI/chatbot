import { z } from "zod";

import {
  AGENT_SCOPES,
  listAgents,
  registerAgent,
} from "@/lib/agents/command-center";
import { fields, validateJson } from "@/lib/validation/api";
import {
  badRequest,
  callerOrganizationId,
  canManage,
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
  return json({ agents: await listAgents(callerOrganizationId(caller)) });
}

/** Owner-only: registers an agent and returns its key exactly once. */
async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (!canManage(caller)) {
    return badRequest("owner_or_admin_required");
  }

  const parsed = await validateJson(
    request,
    z
      .object({
        slug: fields.slug,
        displayName: fields.name,
        role: z.string().trim().min(2).max(64),
        scopes: z.array(z.enum(AGENT_SCOPES)).max(AGENT_SCOPES.length).optional(),
        environment: fields.environment,
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const { slug, displayName, role } = parsed.data;
  const scopes = parsed.data.scopes;
  const environment = parsed.data.environment ?? "production";

  try {
    const created = await registerAgent({
    organizationId: callerOrganizationId(caller), slug, displayName, role, scopes, environment });
    return json({ ...created, warning: "store_this_key_now_it_is_never_returned_again" }, 201);
  } catch (error) {
    if (error instanceof Error && /duplicate key/.test(error.message)) {
      return badRequest("slug_already_registered");
    }
    throw error;
  }
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
