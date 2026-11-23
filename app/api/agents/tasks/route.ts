import { z } from "zod";

import { createTask, listTaskPage, listTasks } from "@/lib/agents/command-center";
import { decodeCursor } from "@/lib/agents/pagination";
import { fields, validateJson, validateQuery } from "@/lib/validation/api";
import {
  badRequest,
  callerOrganizationId,
  canManage,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { parseSkillSnapshot } from "@/lib/agents/skill-snapshot";
import { namedGithubProbePayload } from "@/lib/agents/named-github-probe";

function visibleTasks<T extends { evidence: string | null }>(tasks: T[], isAgent: boolean): T[] {
  if (!isAgent) return tasks;
  return tasks.map((task) =>
    parseSkillSnapshot(task.evidence) ? { ...task, evidence: null } : task
  );
}

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }

  // Query shape first: an unparsed limit reached the SQL LIMIT clause.
  const query = validateQuery(
    request,
    z
      .object({
        status: z
          .enum(["pending", "in_progress", "completed", "failed", "blocked"])
          .optional(),
        ownerAgentId: fields.id.optional(),
        available: z.enum(["true", "false"]).optional(),
        limit: fields.limit.optional(),
        cursor: z.string().max(200).optional(),
        paginate: z.enum(["1"]).optional(),
      })
      .strict()
  );
  if (!query.ok) {
    return badRequest(query.reason);
  }

  // A cursor switches to keyset paging. The legacy `tasks` field stays, so an old
  // client that ignores `nextCursor` still reads a usable first page.
  // Opt-in: a client that asks for paging gets `nextCursor`; one that does not
  // keeps the exact response it has always received.
  if (query.data.paginate === "1" || query.data.cursor !== undefined) {
    const cursor = query.data.cursor === undefined ? null : decodeCursor(query.data.cursor);
    if (query.data.cursor !== undefined && !cursor) {
      return badRequest("invalid_cursor");
    }
    const page = await listTaskPage({
      organizationId: callerOrganizationId(caller),
      status: query.data.status,
      limit: query.data.limit ?? 25,
      cursor,
    });
    return json({ ...page, tasks: visibleTasks(page.tasks, caller.kind === "agent") });
  }

  return json({
    tasks: visibleTasks(await listTasks({
      organizationId: callerOrganizationId(caller),
      status: query.data.status,
      ownerAgentId: query.data.ownerAgentId,
      available: query.data.available === "true",
      limit: query.data.limit ?? 50,
    }), caller.kind === "agent"),
  });
}

/** Owner-only: puts work into the shared queue. */
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
        title: fields.shortText,
        instruction: fields.body,
        ownerAgentId: fields.id.nullish(),
        // Optional in the contract: the route defaults them to "normal" and [].
        priority: fields.priority.optional(),
        dependencies: fields.list.optional(),
        environment: fields.environment,
        approvalRequired: z.boolean().optional(),
        rollbackPlan: z.string().trim().max(4000).nullish(),
        payload: namedGithubProbePayload.optional(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const task = await createTask({
    organizationId: callerOrganizationId(caller),
    title: parsed.data.title,
    instruction: parsed.data.instruction,
    ownerAgentId: parsed.data.ownerAgentId ?? null,
    priority: parsed.data.priority ?? "normal",
    dependencies: parsed.data.dependencies ?? [],
    environment: parsed.data.environment ?? "production",
    approvalRequired: parsed.data.approvalRequired === true,
    rollbackPlan: parsed.data.rollbackPlan ?? null,
    payload: parsed.data.payload ?? null,
    createdBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  return json({ task }, 201);
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const GET = withCommanderTenant(GETHandler);

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
