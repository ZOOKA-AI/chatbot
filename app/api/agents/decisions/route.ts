import { z } from "zod";

import { hasScope, listDecisions, recordDecision } from "@/lib/agents/command-center";
import {
  badRequest,
  callerOrganizationId,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { fields, validateJson, validateQuery } from "@/lib/validation/api";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const query = validateQuery(
    request,
    z.object({ limit: fields.limit.optional() }).strict()
  );
  if (!query.ok) {
    return badRequest(query.reason);
  }
  return json({
    decisions: await listDecisions(
      callerOrganizationId(caller),
      query.data.limit ?? 50
    ),
  });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind === "agent" && !hasScope(caller.agent, "decision:write")) {
    return forbidden("missing_scope:decision:write");
  }

  const parsed = await validateJson(
    request,
    z
      .object({
        title: fields.shortText,
        body: fields.body,
        state: z.enum(["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED"]).optional(),
        taskId: fields.uuid.nullish(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const payload = parsed.data as Record<string, unknown>;
  const title = parsed.data.title;
  const body = parsed.data.body;
  if (!title || !body) {
    return badRequest("title_and_body_required");
  }

  const states = ["PROPOSED", "APPROVED", "IMPLEMENTED", "VERIFIED", "DEPRECATED"];
  const state = typeof payload.state === "string" && states.includes(payload.state)
    ? payload.state
    : "PROPOSED";

  const decision = await recordDecision(caller.kind === "agent" ? caller.agent : null, {
    organizationId: callerOrganizationId(caller),
    title,
    body,
    state,
    taskId: typeof payload.taskId === "string" ? payload.taskId : null,
  });

  return json({ decision }, 201);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
