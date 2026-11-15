import { z } from "zod";

import { createTask, listTasks } from "@/lib/agents/command-center";
import { fields, validateJson, validateQuery } from "@/lib/validation/api";
import {
  badRequest,
  callerOrganizationId,
  canManage,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";

export async function GET(request: Request) {
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
      })
      .strict()
  );
  if (!query.ok) {
    return badRequest(query.reason);
  }

  return json({
    tasks: await listTasks({
      organizationId: callerOrganizationId(caller),
      status: query.data.status,
      ownerAgentId: query.data.ownerAgentId,
      available: query.data.available === "true",
      limit: query.data.limit ?? 50,
    }),
  });
}

/** Owner-only: puts work into the shared queue. */
export async function POST(request: Request) {
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
    createdBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  return json({ task }, 201);
}
