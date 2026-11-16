import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

/**
 * Acceptance for the surfaces a person actually touches: the chat bridge that
 * creates work, and the scheduler endpoint a cron would call.
 *
 * The point of these tests is the boundary, not the happy path: a member must not
 * be able to queue execution work through the chat tool, and the scheduler
 * endpoint must refuse everybody it cannot authenticate before it does anything.
 */

vi.mock("server-only", () => ({}));
// The workspace session module reaches for next-auth internals that only exist
// inside a Next request. These tests do not need a session: they pass a caller in.
vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: async () => null,
  requireWorkspace: async () => {
    throw new Error("no session in this test");
  },
}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { createCommanderTools } from "@/lib/ai/tools/commander";
import { canManage } from "@/lib/agents/auth";
import { POST as schedulerPost } from "@/app/api/agents/scheduler/route";
import { createTask, listTasks } from "@/lib/agents/command-center";
import { withCommanderScope } from "@/lib/agents/commander-scope";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

let admin: ReturnType<typeof postgres>;

describe("permission matrix", () => {
  test("only an owner or admin session may decide anything", () => {
    const owner = { kind: "owner", userId: "u-owner", role: "owner", organizationId: ORG_A } as const;
    const admin_ = { kind: "owner", userId: "u-admin", role: "admin", organizationId: ORG_A } as const;
    const member = { kind: "owner", userId: "u-member", role: "member", organizationId: ORG_A } as const;
    const agent = { kind: "agent", agentId: "a-1", organizationId: ORG_A } as const;
    assert.equal(canManage(owner as never), true);
    assert.equal(canManage(admin_ as never), true);
    assert.equal(canManage(member as never), false, "a member cannot manage");
    assert.equal(canManage(agent as never), false, "an agent key cannot manage");
  });
});

describe.skipIf(!ready)("chat bridge and scheduler endpoint", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");
    admin = postgres(ADMIN as string, { max: 2 });
    await admin.unsafe("select pg_advisory_lock(737373)");
    for (const name of [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0040_agent_tools_and_instructions.sql",
      "pending/0034_agent_execution.sql",
      "pending/0035_worker_lease_and_scheduler.sql",
    ]) {
      const body = readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
      for (const part of body.split("--> statement-breakpoint")) {
        const statement = part.trim();
        if (!statement) continue;
        try {
          await admin.unsafe(statement);
        } catch (error) {
          if (!/already exists|does not exist|skipping/i.test((error as Error).message)) throw error;
        }
      }
    }
    await admin`delete from "SchedulerRun"`;
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
  }, 120_000);

  afterAll(async () => {
    await admin?.unsafe("select pg_advisory_unlock(737373)").catch(() => {});
    await admin?.end({ timeout: 5 });
  }, 30_000);

  test("a member cannot queue execution work through the chat tool", async () => {
    const tools = createCommanderTools({ organizationId: ORG_A, userId: "u-member", canManage: false });
    const refusal = (await tools.createExecutionTask.execute!(
      { title: "Do something", instruction: "A real instruction that is long enough" },
      { toolCallId: "t1", messages: [] } as never
    )) as { ok?: boolean; error?: string };

    assert.equal(refusal.ok, false, "the tool must refuse a caller who cannot manage");
    assert.match(String(refusal.error), /owner|admin/i);
    assert.equal(
      (refusal as { taskId?: string }).taskId,
      undefined,
      "a refusal carries no task id for the model to quote"
    );
    const queued = await admin`select count(*)::int as n from "AgentTask" where "organizationId" = ${ORG_A}`;
    assert.equal(queued[0].n, 0, "nothing was queued by the refusal");
  });

  test("an owner queues work through the chat tool and it is pending, not done", async () => {
    const tools = createCommanderTools({ organizationId: ORG_A, userId: "u-owner", canManage: true });
    const result = (await tools.createExecutionTask.execute!(
      {
        title: "Inspect the authorised repository",
        instruction: "Read the repository metadata and package.json",
      },
      { toolCallId: "t2", messages: [] } as never
    )) as { taskId?: string; status?: string } | string;

    const taskId = typeof result === "string" ? result : result.taskId;
    assert.ok(typeof taskId === "string" && taskId.includes("-"), `tool returned ${JSON.stringify(result)}`);
    const [row] = await admin`select status from "AgentTask" where id = ${String(taskId)}`;
    assert.equal(row.status, "pending", "queued work is pending: nothing has run yet");
  });

  test("the scheduler endpoint refuses an unauthenticated call", async () => {
    delete process.env.SCHEDULER_TOKEN;
    const response = await schedulerPost(new Request("https://example.test/api/agents/scheduler", { method: "POST" }));
    assert.equal(response.status, 401, "no configured token means the endpoint is closed");
  });

  test("the scheduler endpoint refuses a wrong token", async () => {
    process.env.SCHEDULER_TOKEN = "s3cret-scheduler-token-value";
    const wrong = new Request("https://example.test/api/agents/scheduler", {
      method: "POST",
      headers: { authorization: "Bearer not-the-scheduler-token" },
    });
    assert.equal((await schedulerPost(wrong)).status, 401);

    const empty = new Request("https://example.test/api/agents/scheduler", { method: "POST" });
    assert.equal((await schedulerPost(empty)).status, 401, "a bare POST is not authorised either");
  });

  test("an authorised call without a platform connection says so instead of doing half the work", async () => {
    process.env.SCHEDULER_TOKEN = "s3cret-scheduler-token-value";
    delete process.env.DATABASE_URL_PLATFORM;
    const response = await schedulerPost(
      new Request("https://example.test/api/agents/scheduler", {
        method: "POST",
        headers: { authorization: "Bearer s3cret-scheduler-token-value" },
      })
    );
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "platform_connection_required");
  });

  test("one workspace cannot read another's queue", async () => {
    await withCommanderScope(ORG_B, () =>
      createTask({ organizationId: ORG_B, title: "b work", instruction: "instruction for b", createdBy: "owner" })
    );
    const seenFromA = await withCommanderScope(ORG_A, () => listTasks({ organizationId: ORG_A }));
    const orgs = new Set(seenFromA.map((task) => task.organizationId));
    assert.equal(orgs.has(ORG_B), false, "B's task is invisible from A");
    assert.equal(orgs.size <= 1, true);
  });
});
