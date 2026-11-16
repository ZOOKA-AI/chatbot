import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import { agentSchedule, agentTask } from "@/lib/db/schema";

import { nextRunAfter, isValidCron, isValidTimezone } from "./cron";

/**
 * Turning a due schedule into exactly one task.
 *
 * The scheduler is the existing one; this is a step inside each pass, not a second loop.
 * Everything here is written so that running it twice at the same instant is harmless:
 * the unique index on ("scheduleId", "scheduledFor") decides which INSERT wins, and the
 * advance of `nextRunAt` is a conditional UPDATE on the value that was read. The index is
 * plain rather than partial, because `ON CONFLICT` can only infer an index whose predicate
 * it can also see - a lesson from the first run, which failed on exactly that.
 */

export type MaterialiseResult = {
  created: number;
  advanced: number;
  skipped: number;
};

export type ScheduleRecord = {
  id: string;
  organizationId: string;
  title: string;
  instruction: string;
  tool: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  missedRunPolicy: string;
  nextRunAt: Date | null;
  lastRunAt?: Date | null;
  createdBy: string;
};

/** The next instant a schedule should fire, or null if its expression cannot fire again. */
export function nextOccurrence(schedule: Pick<ScheduleRecord, "cronExpression" | "timezone">, from: Date): Date | null {
  return nextRunAfter(schedule.cronExpression, from, schedule.timezone);
}

/**
 * Missed-run policy, stated as data rather than discovered in production:
 *   skip      one task at most, for the most recent slot; the rest are history
 *   run_once  same, but the task is created even though the slot has passed
 * Neither policy backfills every missed occurrence: a scheduler that was down for a week
 * should not wake up and launch a week of work.
 */
export function slotFor(schedule: Pick<ScheduleRecord, "nextRunAt" | "missedRunPolicy">, now: Date): Date | null {
  if (!schedule.nextRunAt) return null;
  const due = schedule.nextRunAt.getTime() <= now.getTime();
  if (!due) return null;
  return schedule.nextRunAt;
}

export async function materialiseDueSchedules(input: {
  now?: Date;
  limit?: number;
  organizationId?: string;
}): Promise<MaterialiseResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 50;

  const due = (await db
    .select()
    .from(agentSchedule)
    .where(
      input.organizationId
        ? and(eq(agentSchedule.enabled, true), lte(agentSchedule.nextRunAt, now), eq(agentSchedule.organizationId, input.organizationId))
        : and(eq(agentSchedule.enabled, true), lte(agentSchedule.nextRunAt, now))
    )
    .orderBy(asc(agentSchedule.nextRunAt))
    .limit(limit)) as ScheduleRecord[];

  let created = 0;
  let advanced = 0;
  let skipped = 0;

  for (const schedule of due) {
    const slot = slotFor(schedule, now);
    if (!slot) {
      skipped += 1;
      continue;
    }

    // An expression that was edited into something impossible keeps its row and stops
    // firing, rather than being deleted: a schedule that vanishes is harder to notice.
    if (!isValidCron(schedule.cronExpression) || !isValidTimezone(schedule.timezone)) {
      skipped += 1;
      continue;
    }


    const inserted = await db
      .insert(agentTask)
      .values({
        organizationId: schedule.organizationId,
        title: schedule.title,
        instruction: schedule.instruction,
        status: "pending",
        approvalRequired: false,
        createdBy: schedule.createdBy ?? "scheduler",
        scheduleId: schedule.id,
        scheduledFor: slot,
      })
      .onConflictDoNothing({ target: [agentTask.scheduleId, agentTask.scheduledFor] })
      .returning({ id: agentTask.id });

    if (inserted.length > 0) created += 1;
    else skipped += 1; // another scheduler already materialised this slot

    const next = nextOccurrence(schedule, now);

    if (next === null) {
      // A syntactically valid expression that can never match again (30 February) would
      // otherwise stay enabled with no next run: a schedule the UI shows as live and that
      // silently never fires. The due slot still runs; the schedule then says why it stopped.
      await db
        .update(agentSchedule)
        .set({ enabled: false, nextRunAt: null, lastRunAt: now, updatedAt: now })
        .where(eq(agentSchedule.id, schedule.id));
      advanced += 1;
      continue;
    }

    // Conditioned on "still due", not on equality with the value just read: a
    // timestamptz read back into JavaScript is a millisecond Date, so an equality test
    // against the original microseconds matched nothing and the schedule never advanced.
    // "Still due" is the property that actually matters: if another process advanced it
    // first, nextRunAt is in the future and this UPDATE matches no row.
    const updated = await db
      .update(agentSchedule)
      .set({ nextRunAt: next, lastRunAt: now, updatedAt: now })
      .where(and(eq(agentSchedule.id, schedule.id), lte(agentSchedule.nextRunAt, now)))
      .returning({ id: agentSchedule.id });

    if (updated.length > 0) advanced += 1;
  }

  return { created, advanced, skipped };
}

/** Pausing keeps the expression and the history; it only stops materialisation. */
export async function setScheduleEnabled(input: {
  organizationId: string;
  scheduleId: string;
  enabled: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [existing] = (await db
    .select()
    .from(agentSchedule)
    .where(and(eq(agentSchedule.id, input.scheduleId), eq(agentSchedule.organizationId, input.organizationId)))
    .limit(1)) as ScheduleRecord[];

  if (!existing) return null;

  // Resuming recomputes from now, so a schedule paused for a month does not fire once per
  // missed day the moment it is resumed.
  const nextRunAt = input.enabled ? nextOccurrence(existing, now) : existing.nextRunAt;

  const [row] = await db
    .update(agentSchedule)
    .set({ enabled: input.enabled, nextRunAt, updatedAt: now })
    .where(and(eq(agentSchedule.id, input.scheduleId), eq(agentSchedule.organizationId, input.organizationId)))
    .returning();

  return (row ?? null) as ScheduleRecord | null;
}

/** The next few occurrences, for a UI that shows what will actually run. */
export function upcomingOccurrences(
  schedule: Pick<ScheduleRecord, "cronExpression" | "timezone">,
  count: number,
  from: Date = new Date()
): Date[] {
  const result: Date[] = [];
  let cursor = from;
  for (let i = 0; i < count; i += 1) {
    const next = nextRunAfter(schedule.cronExpression, cursor, schedule.timezone);
    if (!next) break;
    result.push(next);
    cursor = next;
  }
  return result;
}
