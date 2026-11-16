import { z } from "zod";

import { hasScope, listDeployments, recordDeployment } from "@/lib/agents/command-center";
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
    deployments: await listDeployments(
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
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "deployment:write")) {
    return forbidden("missing_scope:deployment:write");
  }

  const parsed = await validateJson(
    request,
    z
      .object({
        environment: fields.environment,
        commitSha: fields.commitSha.nullish(),
        deploymentId: z.string().trim().min(1).max(120).nullish(),
        status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
        notes: z.string().trim().max(2000).nullish(),
        rollbackOf: fields.uuid.nullish(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const payload = parsed.data as Record<string, unknown>;

  const deployment = await recordDeployment(caller.agent, {
    organizationId: callerOrganizationId(caller),
    environment: typeof payload.environment === "string" ? payload.environment : "production",
    commitSha: typeof payload.commitSha === "string" ? payload.commitSha : null,
    deploymentId: typeof payload.deploymentId === "string" ? payload.deploymentId : null,
    status: typeof payload.status === "string" ? payload.status : "pending",
    notes: typeof payload.notes === "string" ? payload.notes : null,
    rollbackOf: typeof payload.rollbackOf === "string" ? payload.rollbackOf : null,
  });

  return json({ deployment }, 201);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
