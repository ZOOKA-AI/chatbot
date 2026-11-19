import { z } from "zod";

import { json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { upcomingOccurrences, validateScheduleInput } from "@/lib/agents/schedule";
import { validateQuery } from "@/lib/validation/api";

/**
 * What would this expression actually do?
 *
 * The preview is computed by the same engine the scheduler runs, not by a second cron parser
 * in the browser, so what the customer sees before saving is what will happen after saving.
 * Nothing is written here.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const query = validateQuery(
    request,
    z
      .object({
        cron: z.string().min(1).max(64),
        timezone: z.string().min(3).max(64).optional(),
        count: z.coerce.number().int().min(1).max(10).optional(),
      })
      .strict()
  );
  if (!query.ok) return json({ ok: false, error: "invalid_query", reason: query.reason }, 400);

  const timezone = query.data.timezone ?? "Asia/Dubai";
  const check = validateScheduleInput({ cronExpression: query.data.cron, timezone });
  if (!check.ok) return json({ ok: false, error: check.error });

  const upcoming = upcomingOccurrences(
    { cronExpression: query.data.cron, timezone },
    query.data.count ?? 3,
    new Date()
  );

  return json({
    ok: true,
    timezone,
    upcoming: upcoming.map((date) => date.toISOString()),
    /** The same instants rendered in the schedule's own zone, for the customer to read. */
    local: upcoming.map((date) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    ),
  });
}

export const GET = withCommanderTenant(GETHandler);
