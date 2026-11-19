import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * The schedule endpoints' edge behaviour: who may write, what is refused before it is
 * stored, and that another workspace's schedule is a 404 rather than a 403.
 */

const holder = vi.hoisted(() => ({
  caller: null as null | { userId: string; organizationId: string; role: string; kind: "user" },
  created: [] as unknown[],
  deleted: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => holder.caller,
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  badRequest: (reason: string) => new Response(JSON.stringify({ error: "bad_request", reason }), { status: 400 }),
  callerOrganizationId: (caller: { organizationId: string }) => caller.organizationId,
  canManage: (caller: { role: string; kind?: string } | null) =>
    Boolean(caller && caller.kind !== "agent" && ["owner", "admin"].includes(caller.role)),
}));

// The scheduler module is replaced so these tests assert the route contract, while the
// engine itself is covered separately against real PostgreSQL.
vi.mock("@/lib/agents/schedule", () => ({
  listSchedules: async (organizationId: string) =>
    organizationId === "org-a" ? [{ id: "s1", organizationId, cronExpression: "0 9 * * *", timezone: "Asia/Dubai" }] : [],
  upcomingOccurrences: () => [new Date("2026-11-17T05:00:00Z")],
  validateScheduleInput: ({ cronExpression, timezone }: { cronExpression: string; timezone?: string }) => {
    if (cronExpression === "nonsense") return { ok: false, error: "invalid_cron" };
    if (cronExpression === "0 0 30 2 *") return { ok: false, error: "cron_never_fires" };
    if (timezone === "Mars/Olympus") return { ok: false, error: "invalid_timezone" };
    return { ok: true };
  },
  createSchedule: async (input: { organizationId: string }) => {
    holder.created.push(input);
    return { id: "new", ...input };
  },
  getSchedule: async ({ organizationId, scheduleId }: { organizationId: string; scheduleId: string }) =>
    organizationId === "org-a" && scheduleId === "11111111-1111-4111-8111-111111111111" ? { id: scheduleId } : null,
  updateSchedule: async () => ({ id: "s1" }),
  setScheduleEnabled: async () => ({ id: "s1", enabled: true }),
  deleteSchedule: async ({ scheduleId }: { scheduleId: string }) => {
    holder.deleted.push(scheduleId);
    return scheduleId === "11111111-1111-4111-8111-111111111111" && holder.caller?.organizationId === "org-a";
  },
  scheduleHistory: async () => [{ id: "t1", status: "completed", scheduledFor: null, createdAt: new Date().toISOString(), title: "ran" }],
}));

import { GET as preview } from "@/app/api/agents/schedules/preview/route";
import { GET as list, POST as create } from "@/app/api/agents/schedules/route";
import { DELETE as remove, GET as detail } from "@/app/api/agents/schedules/[id]/route";

const url = (path: string) => new Request(`https://zooka-ai.com${path}`);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  holder.caller = null;
  holder.created = [];
  holder.deleted = [];
});

describe("preview uses the scheduler's own validation", () => {
  test("refuses an unauthenticated caller", async () => {
    assert.equal((await preview(url("/api/agents/schedules/preview?cron=0%209%20*%20*%20*"))).status, 401);
  });

  test("returns the next runs in the schedule's timezone", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "member", kind: "user" };
    const body = await (await preview(url("/api/agents/schedules/preview?cron=0%209%20*%20*%20*&timezone=Asia/Dubai"))).json();
    assert.equal(body.ok, true);
    assert.equal(body.timezone, "Asia/Dubai");
    assert.equal(body.upcoming.length, 1);
  });

  test("reports why an expression will not run", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "member", kind: "user" };
    const never = await (await preview(url("/api/agents/schedules/preview?cron=0%200%2030%202%20*"))).json();
    assert.equal(never.ok, false);
    assert.equal(never.error, "cron_never_fires");
  });
});

describe("creating a schedule", () => {
  test("refuses an unauthenticated caller", async () => {
    const response = await create(
      new Request("https://zooka-ai.com/api/agents/schedules", {
        method: "POST",
        body: JSON.stringify({ title: "x", instruction: "yyyyyyyyyy", cronExpression: "0 9 * * *" }),
      })
    );
    assert.equal(response.status, 401);
  });

  test("refuses a member who is not an owner or admin", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "member", kind: "user" };
    const response = await create(
      new Request("https://zooka-ai.com/api/agents/schedules", {
        method: "POST",
        body: JSON.stringify({ title: "report", instruction: "summarise the repository", cronExpression: "0 9 * * *" }),
      })
    );
    assert.equal(response.status, 403);
    assert.equal(holder.created.length, 0);
  });

  test("refuses an unparseable expression before writing", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await create(
      new Request("https://zooka-ai.com/api/agents/schedules", {
        method: "POST",
        body: JSON.stringify({ title: "report", instruction: "summarise the repository", cronExpression: "nonsense" }),
      })
    );
    assert.equal(response.status, 400);
    assert.equal(holder.created.length, 0);
  });

  test("refuses an unknown timezone", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await create(
      new Request("https://zooka-ai.com/api/agents/schedules", {
        method: "POST",
        body: JSON.stringify({
          title: "report",
          instruction: "summarise the repository",
          cronExpression: "0 9 * * *",
          timezone: "Mars/Olympus",
        }),
      })
    );
    assert.equal(response.status, 400);
  });

  test("creates for the caller's workspace, never one named in the body", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await create(
      new Request("https://zooka-ai.com/api/agents/schedules", {
        method: "POST",
        body: JSON.stringify({
          title: "report",
          instruction: "summarise the repository",
          cronExpression: "0 9 * * *",
          organizationId: "org-b",
        }),
      })
    );
    // An unknown field is refused outright rather than ignored.
    assert.equal(response.status, 400);
    assert.equal(holder.created.length, 0);
  });
});

describe("one schedule", () => {
  test("another workspace gets 404, not a confirming 403", async () => {
    holder.caller = { userId: "u1", organizationId: "org-b", role: "owner", kind: "user" };
    const response = await detail(url("/api/agents/schedules/11111111-1111-4111-8111-111111111111"), params("11111111-1111-4111-8111-111111111111"));
    assert.equal(response.status, 404);
  });

  test("its own workspace sees the schedule with history", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await detail(url("/api/agents/schedules/11111111-1111-4111-8111-111111111111"), params("11111111-1111-4111-8111-111111111111"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.history.length, 1);
  });

  test("deletion by another workspace removes nothing", async () => {
    holder.caller = { userId: "u1", organizationId: "org-b", role: "owner", kind: "user" };
    const response = await remove(url("/api/agents/schedules/11111111-1111-4111-8111-111111111111"), params("11111111-1111-4111-8111-111111111111"));
    assert.equal(response.status, 404);
  });

  test("deletion by its own workspace succeeds and says history stays", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await remove(url("/api/agents/schedules/11111111-1111-4111-8111-111111111111"), params("11111111-1111-4111-8111-111111111111"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.deleted, true);
    assert.match(body.note, /history/i);
  });
});

test("listing is scoped to the caller's workspace", async () => {
  holder.caller = { userId: "u1", organizationId: "org-b", role: "member", kind: "user" };
  const body = await (await list(url("/api/agents/schedules"))).json();
  assert.equal(body.schedules.length, 0);
});
