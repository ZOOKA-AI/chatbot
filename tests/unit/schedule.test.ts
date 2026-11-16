import assert from "node:assert/strict";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Recurring schedules against a real PostgreSQL server, not a fixture.
 *
 * Every claim here is about what the database does with two processes racing: the unique
 * index decides the duplicate, the conditional UPDATE decides the advance. Mocking that
 * would test the mock.
 *
 * Skips loudly when no isolated server is configured, because a silently skipped
 * integration test is how "tested" becomes untrue.
 */

const ADMIN_URL = process.env.ZOOKA_TEST_PG_ADMIN;

const ORG_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG_B = "bbbbbbbb-2222-4222-8222-222222222222";
const SCHEDULE_A = "aaaa1111-1111-4111-8111-111111111111";
const SCHEDULE_B = "bbbb2222-2222-4222-8222-222222222222";

let sql: ReturnType<typeof postgres> | null = null;
let mod: typeof import("@/lib/agents/schedule") | null = null;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  process.env.DATABASE_URL = ADMIN_URL;
  sql = postgres(ADMIN_URL, { max: 2, onnotice: () => {} });
  mod = await import("@/lib/agents/schedule");
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

const suite = ADMIN_URL ? describe : describe.skip;

suite("a due schedule becomes exactly one task", () => {
  beforeAll(async () => {
    await sql!`delete from "AgentTask" where "scheduleId" in (${SCHEDULE_A}, ${SCHEDULE_B})`;
    await sql!`delete from "AgentSchedule" where id in (${SCHEDULE_A}, ${SCHEDULE_B})`;
    const past = new Date(Date.now() - 120_000);
    for (const [id, org, cron] of [
      [SCHEDULE_A, ORG_A, "0 * * * *"],
      [SCHEDULE_B, ORG_B, "*/30 * * * *"],
    ] as const) {
      await sql!`insert into "AgentSchedule"
        (id, "organizationId", title, instruction, tool, "cronExpression", timezone, enabled, "missedRunPolicy", "nextRunAt")
        values (${id}, ${org}, 'recurring read', 'inspect', 'github_repo_inspect', ${cron}, 'Asia/Dubai', true, 'skip', ${past})`;
    }
  });

  test("two passes in the same second do not create two tasks", async () => {
    const now = new Date();
    // Concurrent materialisation is the real question: the insert relies on the unique
    // ("scheduleId", "scheduledFor") index, so the loser writes nothing rather than failing.
    const [first, second] = await Promise.all([
      mod!.materialiseDueSchedules({ now, limit: 10 }),
      mod!.materialiseDueSchedules({ now, limit: 10 }),
    ]);

    const rows = await sql!`select "scheduleId", count(*)::int as n from "AgentTask"
      where "scheduleId" in (${SCHEDULE_A}, ${SCHEDULE_B}) group by "scheduleId"`;
    assert.equal(rows.length, 2, "one task per schedule, one per workspace");
    for (const row of rows) assert.equal(row.n, 1, `schedule ${row.scheduleId} created ${row.n} tasks`);
    assert.equal(first.created + second.created, 2, "only two tasks were created in total");
  });

  test("nextRunAt advances and the task keeps its slot", async () => {
    const schedules = await sql!`select id, "nextRunAt" from "AgentSchedule" where id in (${SCHEDULE_A}, ${SCHEDULE_B})`;
    for (const row of schedules) {
      assert.ok(new Date(row.nextRunAt).getTime() > Date.now(), `${row.id} did not advance`);
    }
    const tasks = await sql!`select "scheduledFor" from "AgentTask" where "scheduleId" = ${SCHEDULE_A}`;
    // The slot is when it was due, not when it was noticed.
    assert.ok(new Date(tasks[0].scheduledFor).getTime() < Date.now());
  });

  test("polling again creates nothing more", async () => {
    const before = await sql!`select count(*)::int as n from "AgentTask"`;
    const result = await mod!.materialiseDueSchedules({ now: new Date(), limit: 10 });
    const after = await sql!`select count(*)::int as n from "AgentTask"`;
    assert.equal(result.created, 0);
    assert.equal(after[0].n, before[0].n);
  });

  test("workspace scoping is applied, not assumed", async () => {
    // Make A due again, then materialise only for B's workspace.
    await sql!`update "AgentSchedule" set "nextRunAt" = now() - interval '1 minute' where id = ${SCHEDULE_A}`;
    const scoped = await mod!.materialiseDueSchedules({ organizationId: ORG_B, limit: 10 });
    void scoped;
    const fromA = await sql!`select count(*)::int as n from "AgentTask" where "scheduleId" = ${SCHEDULE_A} and "organizationId" = ${ORG_A}`;
    assert.equal(fromA[0].n, 1, "a task was created for a workspace that was not asked for");
  });

  test("pausing stops materialisation, resuming recomputes from now", async () => {
    await sql!`update "AgentSchedule" set "nextRunAt" = now() - interval '5 minutes' where id = ${SCHEDULE_A}`;
    const paused = await mod!.setScheduleEnabled({ organizationId: ORG_A, scheduleId: SCHEDULE_A, enabled: false });
    assert.equal(paused?.enabled, false);

    const whilePaused = await mod!.materialiseDueSchedules({ now: new Date(), organizationId: ORG_A, limit: 10 });
    assert.equal(whilePaused.created, 0, "a paused schedule fired");

    const resumed = await mod!.setScheduleEnabled({ organizationId: ORG_A, scheduleId: SCHEDULE_A, enabled: true });
    assert.equal(resumed?.enabled, true);
    // Resuming after a pause does not replay every slot that was missed.
    assert.ok(new Date(resumed!.nextRunAt!).getTime() > Date.now(), "resume left the schedule in the past");
  });

  test("another workspace cannot pause this schedule", async () => {
    const refused = await mod!.setScheduleEnabled({ organizationId: ORG_B, scheduleId: SCHEDULE_A, enabled: false });
    assert.equal(refused, null);
  });

  test("a schedule that can never match again disables itself instead of looking live", async () => {
    // 30 February parses as a valid five-field expression but has no next occurrence.
    await sql!`update "AgentSchedule" set "cronExpression" = '0 0 30 2 *', "nextRunAt" = now() - interval '1 minute' where id = ${SCHEDULE_B}`;
    await mod!.materialiseDueSchedules({ now: new Date(), organizationId: ORG_B, limit: 10 });

    const [row] = await sql!`select enabled, "nextRunAt" from "AgentSchedule" where id = ${SCHEDULE_B}`;
    assert.equal(row.enabled, false, "a schedule with no next run stayed enabled");
    assert.equal(row.nextRunAt, null);

    // And it stays quiet: a second pass creates nothing and does not re-enable it.
    await sql!`update "AgentSchedule" set "nextRunAt" = now() - interval '1 minute' where id = ${SCHEDULE_B}`;
    const again = await mod!.materialiseDueSchedules({ now: new Date(), organizationId: ORG_B, limit: 10 });
    assert.equal(again.created, 0);

    await sql!`update "AgentSchedule" set "cronExpression" = '*/30 * * * *', enabled = true where id = ${SCHEDULE_B}`;
  });
});

describe("upcoming occurrences are computed in the caller's timezone", () => {
  test("weekday mornings in Dubai stay on weekday mornings", async () => {
    const { upcomingOccurrences } = (await import("@/lib/agents/schedule")) as typeof import("@/lib/agents/schedule");
    const upcoming = upcomingOccurrences(
      { cronExpression: "0 9 * * mon-fri", timezone: "Asia/Dubai" },
      4,
      new Date("2026-11-16T11:00:00Z") // Monday 15:00 Dubai, after the morning run
    );
    assert.equal(upcoming.length, 4);
    for (const instant of upcoming) {
      const dubai = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dubai",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      }).format(instant);
      assert.equal(dubai, "09:00");
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", weekday: "short" }).format(instant);
      assert.ok(["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday), weekday);
    }
  });
});
