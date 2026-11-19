import { listApprovals } from "@/lib/agents/command-center";
import { z } from "zod";

import {
  badRequest,
  callerOrganizationId,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { fields, validateQuery } from "@/lib/validation/api";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

/** Approvals are always read inside the caller's own organisation. */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }

  const parsed = validateQuery(
    request,
    z
      .object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        limit: fields.limit.optional(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }

  const approvals = await listApprovals(callerOrganizationId(caller), {
    status: parsed.data.status,
    limit: parsed.data.limit,
  });
  return json({ approvals });
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);
