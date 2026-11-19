import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import {
  deleteSchedule,
  getSchedule,
  scheduleHistory,
  setScheduleEnabled,
  updateSchedule,
  upcomingOccurrences,
  validateScheduleInput,
} from "@/lib/agents/schedule";
import { validateJson } from "@/lib/validation/api";

/**
 * One schedule: read it with its history, edit it, pause it, remove it.
 *
 * Every one of these is scoped by the caller's workspace, so a schedule id from another
 * workspace is a 404 here and never a 403 that would confirm it exists.
 */

type Params = { params: Promise<{ id: string }> };

const patchBody = z
  .object({
    title: z.string().min(3).max(200).optional(),
    instruction: z.string().min(10).max(4000).optional(),
    cronExpression: z.string().min(9).max(64).optional(),
    timezone: z.string().min(3).max(64).optional(),
    tool: z.string().min(3).max(64).optional(),
    missedRunPolicy: z.enum(["skip", "run_once"]).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

async function GETHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const { id } = await context.params;
  const organizationId = callerOrganizationId(caller);

  const schedule = await getSchedule({ organizationId, scheduleId: id });
  if (!schedule) return json({ error: "not_found" }, 404);

  return json({
    schedule: {
      ...schedule,
      upcoming: upcomingOccurrences(schedule, 5, new Date()).map((date) => date.toISOString()),
    },
    history: await scheduleHistory({ organizationId, scheduleId: id, limit: 20 }),
  });
}

async function PATCHHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { id } = await context.params;
  const organizationId = callerOrganizationId(caller);

  const parsed = await validateJson(request, patchBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  const { enabled, ...patch } = parsed.data;

  if (Object.keys(patch).length > 0) {
    const check = validateScheduleInput({
      cronExpression: patch.cronExpression ?? "",
      timezone: patch.timezone,
    });
    // Only validate what was actually sent: a title-only edit must not be rejected because
    // the caller did not repeat the cron expression.
    if (patch.cronExpression !== undefined || patch.timezone !== undefined) {
      const current = await getSchedule({ organizationId, scheduleId: id });
      if (!current) return json({ error: "not_found" }, 404);
      const validated = validateScheduleInput({
        cronExpression: patch.cronExpression ?? current.cronExpression,
        timezone: patch.timezone ?? current.timezone,
      });
      if (!validated.ok) return json({ error: validated.error }, 400);
    } else if (!check.ok && patch.timezone !== undefined) {
      return json({ error: check.error }, 400);
    }

    const updated = await updateSchedule({ organizationId, scheduleId: id, patch });
    if (updated === null) return json({ error: "not_found" }, 404);
    if ("error" in updated) return json({ error: updated.error }, 400);
    if (enabled === undefined) return json({ schedule: updated });
  }

  if (enabled !== undefined) {
    const toggled = await setScheduleEnabled({ organizationId, scheduleId: id, enabled });
    if (!toggled) return json({ error: "not_found" }, 404);
    return json({ schedule: toggled });
  }

  const current = await getSchedule({ organizationId, scheduleId: id });
  if (!current) return json({ error: "not_found" }, 404);
  return json({ schedule: current });
}

async function DELETEHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);

  const { id } = await context.params;
  const removed = await deleteSchedule({ organizationId: callerOrganizationId(caller), scheduleId: id });
  if (!removed) return json({ error: "not_found" }, 404);

  // The tasks it produced are history and stay. Saying so in the response keeps the UI from
  // implying that removing a schedule erased what already ran.
  return json({ deleted: true, id, note: "Its past tasks remain in execution history." });
}

export const GET = withCommanderTenant(GETHandler);
export const PATCH = withCommanderTenant(PATCHHandler);
export const DELETE = withCommanderTenant(DELETEHandler);
