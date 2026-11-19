import { z } from "zod";

import {
  AGENT_SCOPES,
  countOtherActiveAgents,
  listAgents,
  updateAgentConfig,
  registerAgent,
} from "@/lib/agents/command-center";
import { guardLastActiveAgent, parseAgentPatch } from "@/lib/agents/agent-config";
import { fields, validateJson } from "@/lib/validation/api";
import {
  badRequest,
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { toolCatalog } from "@/lib/agents/agent-tools";
import { SELECTABLE_MODEL_PROVIDERS, modelCredentialStatus } from "@/lib/agents/agent-config";

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const agents = await listAgents(callerOrganizationId(caller));

  // The picker needs to know what is assignable and what this deployment can actually reach.
  // Both come from the server: a tool the worker does not implement, or a provider with no
  // credential, must not appear as a choice the customer can make and then fail at.
  return json({
    agents,
    tools: toolCatalog(),
    providers: SELECTABLE_MODEL_PROVIDERS.map((provider) => ({
      id: provider,
      credentials: modelCredentialStatus(provider),
    })),
  });
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
/**
 * Changing an agent is a management action: an agent key may not edit scopes, because that
 * is how an agent would grant itself authority it was not given.
 */
async function PATCHHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return forbidden("owner_or_admin_required");

  // The shape is described twice on purpose: this schema bounds what arrives, and
  // `parseAgentPatch` decides what is meaningful. A field this schema does not name is
  // refused by `parseAgentPatch` as unknown rather than silently dropped here.
  const parsed = await validateJson(
    request,
    z
      .object({
        agentId: fields.uuid,
        displayName: z.string().optional(),
        status: z.string().optional(),
        environment: z.string().optional(),
        scopes: z.array(z.string()).optional(),
        // The agent console sends this alongside the other fields it edits. Without
        // it here the strict schema refused the whole save, so no agent could ever
        // be given a tool and no task could ever be planned against one.
        allowedTools: z.array(z.string().trim().min(1).max(64)).max(64).nullable().optional(),
        // The console posts every field it edits in one body, so each of these must be
        // nameable here. `instructions`, `modelProvider` and `modelId` were missing while
        // the editor always sent them, and `.strict()` refused the whole save with
        // `invalid_body`: no agent could be renamed, given instructions, given a model or
        // given a tool from the console at all.
        instructions: z.string().max(4000).nullable().optional(),
        modelProvider: z.string().trim().max(64).nullable().optional(),
        modelId: z.string().trim().max(128).nullable().optional(),
      })
      .strict()
  );
  if (!parsed.ok) return badRequest(parsed.reason);

  const { agentId, ...rest } = parsed.data as Record<string, unknown> & { agentId: string };
  const validated = parseAgentPatch(rest);
  if (!validated.ok) return badRequest(validated.error);

  const organizationId = callerOrganizationId(caller);
  if (validated.patch.status === "disabled") {
    // Read, then write, both scoped to this workspace: the guard has to reason about the
    // agents that remain, not about the one being changed.
    const others = await countOtherActiveAgents({ organizationId, agentId });
    const guarded = guardLastActiveAgent(validated.patch, others);
    if (!guarded.ok) return badRequest(guarded.error);
  }

  const agent = await updateAgentConfig({ organizationId, agentId, patch: validated.patch });
  if (!agent) return json({ error: "not_found" }, 404);
  return json({ agent });
}

export const GET = withCommanderTenant(GETHandler);
export const PATCH = withCommanderTenant(PATCHHandler);

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
