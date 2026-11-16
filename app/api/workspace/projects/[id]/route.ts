import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { listProjectDocuments } from "@/lib/projects/documents";
import {
  deleteProject,
  getProject,
  listProjectAgents,
  listProjectExecutions,
  listProjectSchedules,
  listProjectTasks,
  updateProject,
} from "@/lib/projects/store";
import { validateJson, validateQuery } from "@/lib/validation/api";

/**
 * One project, with the things attached to it.
 *
 * The overview is assembled from the tables that own the facts: agents by projectId, tasks by
 * projectId, and executions through their tasks. Nothing is copied into a second place, so the
 * project page cannot disagree with the Commander about what ran.
 */

type Params = { params: Promise<{ id: string }> };

const patchBody = z
  .object({
    name: z.string().min(2).max(200).optional(),
    summary: z.string().max(2000).nullish(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    brief: z.record(z.string(), z.unknown()).nullish(),
    siteProjectId: z.string().uuid().nullish(),
  })
  .strict();

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

  const [agents, tasks, executions, schedules, documents] = await Promise.all([
    listProjectAgents(organizationId, id),
    listProjectTasks({ organizationId, projectId: id, limit: query.data.limit ?? 20 }),
    listProjectExecutions({ organizationId, projectId: id, limit: query.data.limit ?? 20 }),
    listProjectSchedules(organizationId, id),
    listProjectDocuments(organizationId, id, 20),
  ]);

  return json({ project, agents, tasks, executions, schedules, documents });
}

async function PATCHHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { id } = await context.params;
  const parsed = await validateJson(request, patchBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  const updated = await updateProject({
    organizationId: callerOrganizationId(caller),
    projectId: id,
    patch: parsed.data,
  });
  if (!updated.ok) return json({ error: updated.error }, updated.error === "not_found" ? 404 : 400);
  return json({ project: updated.project });
}

async function DELETEHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { id } = await context.params;
  const removed = await deleteProject({ organizationId: callerOrganizationId(caller), projectId: id });
  if (!removed.ok) return json({ error: removed.error }, 404);

  // The response says which happened: a project holding real work is archived, not destroyed.
  return json({
    ok: true,
    mode: removed.mode,
    keptTasks: removed.keptTasks,
    detail:
      removed.mode === "archived"
        ? "The project was archived. Its tasks and execution evidence were kept because they record work that ran."
        : "The project was deleted. It had no tasks or schedules.",
  });
}

export const GET = withCommanderTenant(GETHandler);
export const PATCH = withCommanderTenant(PATCHHandler);
export const DELETE = withCommanderTenant(DELETEHandler);
