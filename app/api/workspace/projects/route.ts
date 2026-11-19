import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { createProject, listProjects } from "@/lib/projects/store";
import { validateJson, validateQuery } from "@/lib/validation/api";

/**
 * A workspace's projects: the container agent work belongs to.
 *
 * Deliberately not `/api/projects`, which already serves client site projects (subdomain,
 * custom domain, template) and has its own contract and tests. This endpoint is about the
 * workspace container: what agents, tasks and schedules are attached to. A workspace project
 * may point at a site project through `siteProjectId`; it is not a replacement for it.
 */

const createBody = z
  .object({
    name: z.string().min(2).max(200),
    summary: z.string().max(2000).nullish(),
    brief: z.record(z.string(), z.unknown()).nullish(),
    siteProjectId: z.string().uuid().nullish(),
  })
  .strict();

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const query = validateQuery(
    request,
    z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).strict()
  );
  if (!query.ok) return json({ error: "invalid_query", reason: query.reason }, 400);

  const projects = await listProjects(callerOrganizationId(caller), query.data.limit);
  return json({ projects, count: projects.length });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const parsed = await validateJson(request, createBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  const created = await createProject({
    organizationId: callerOrganizationId(caller),
    name: parsed.data.name,
    summary: parsed.data.summary,
    brief: parsed.data.brief,
    siteProjectId: parsed.data.siteProjectId,
    createdBy: caller.userId.slice(0, 64),
  });
  if (!created.ok) return json({ error: created.error }, created.error === "name_taken" ? 409 : 400);

  return json({ project: created.project }, 201);
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
