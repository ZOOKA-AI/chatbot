import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { getProject } from "@/lib/projects/store";
import { listProjectDocuments } from "@/lib/projects/documents";
import { validateQuery } from "@/lib/validation/api";

/**
 * The documents filed under one project.
 *
 * Scoped twice: the project lookup refuses another workspace's project, and the document query
 * carries the caller's organization. A member of a different workspace gets 404, never a list.
 */

type Params = { params: Promise<{ id: string }> };

async function GETHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const { id } = await context.params;
  const organizationId = callerOrganizationId(caller);

  const query = validateQuery(
    request,
    z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).strict()
  );
  if (!query.ok) return json({ error: "invalid_query", reason: query.reason }, 400);

  const project = await getProject({ organizationId, projectId: id });
  if (!project) return json({ error: "not_found" }, 404);

  const documents = await listProjectDocuments(organizationId, id, query.data.limit ?? 50);
  return json({ documents });
}

export const GET = withCommanderTenant(GETHandler);
