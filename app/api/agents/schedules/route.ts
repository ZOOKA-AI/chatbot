import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { createSchedule, listSchedules, validateScheduleInput } from "@/lib/agents/schedule";
import { upcomingOccurrences } from "@/lib/agents/schedule";
import { validateJson, validateQuery } from "@/lib/validation/api";

/**
 * A customer's schedules.
 *
 * Reading is allowed to anyone in the workspace; writing needs owner or admin, because a
 * schedule spends the workspace's execution budget on a timer with nobody watching.
 */

const scheduleBody = z
  .object({
    title: z.string().min(3).max(200),
    instruction: z.string().min(10).max(4000),
    cronExpression: z.string().min(9).max(64),
    timezone: z.string().min(3).max(64).optional(),
    tool: z.string().min(3).max(64).optional(),
    missedRunPolicy: z.enum(["skip", "run_once"]).optional(),
  })
  .strict();

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const query = validateQuery(request, z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).strict());
  if (!query.ok) return json({ error: "invalid_query", reason: query.reason }, 400);

  const schedules = await listSchedules(callerOrganizationId(caller), query.data.limit);
  return json({
    schedules: schedules.map((schedule) => ({
      ...schedule,
      // The next three runs are computed here, in the schedule's own timezone, so the page
      // shows what the scheduler will actually do rather than what the customer assumes.
      upcoming: upcomingOccurrences(schedule, 3, new Date()).map((date) => date.toISOString()),
    })),
    count: schedules.length,
  });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const parsed = await validateJson(request, scheduleBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  // Refused before the write, with the same reason the scheduler would use later.
  const check = validateScheduleInput({
    cronExpression: parsed.data.cronExpression,
    timezone: parsed.data.timezone,
  });
  if (!check.ok) return json({ error: check.error }, 400);

  const created = await createSchedule({
    organizationId: callerOrganizationId(caller),
    ...parsed.data,
    createdBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  if ("error" in created) return json({ error: created.error }, 400);
  return json({ schedule: created }, 201);
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
