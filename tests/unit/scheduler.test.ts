import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, test, describe, vi } from "vitest";

/**
 * The scheduler on a real PostgreSQL server.
 *
 * Three properties matter more than any other: it cannot run twice at once, it
 * cannot let one workspace monopolise the queue, and it cannot leave a task
 * looking busy for ever after a worker disappears.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { runScheduler } from "@/lib/agents/scheduler";
import { withCommanderScope } from "@/lib/agents/commander-scope";
import { createTask } from "@/lib/agents/command-center";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOCK_KEY = 8135713;

let admin: ReturnType<typeof postgres>;

const okFetch = (async (url: string) => {
  if (String(url).includes("/user/repos") || String(url).includes("/installation/repositories")) {
    return new Response(JSON.stringify({ repositories: [{ full_name: "zooka-ai/chatbot" }] }), { status: 200 });
  }
  if (String(url).includes("/repos/zooka-ai/chatbot")) {
    return new Response(
      JSON.stringify({ full_name: "zooka-ai/chatbot", private: false, default_branch: "main", size: 10 }),
      { status: 200 }
    );
  }
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;

async function queue(organizationId: string, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const task = await withCommanderScope(organizationId, () =>
      createTask({ organizationId, title: `t${i}`, instruction: "inspect", createdBy: "owner" })
    );
    ids.push(task.id);
  }
  return ids;
}

describe.skipIf(!ready)("scheduler", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    // Local development server only; the guard in platform-client refuses
    // production hosts outright.
    process.env.DATABASE_URL_PLATFORM = ADMIN as string;
    process.env.WORKER_ALLOW_SHARED_CREDENTIAL = "1";
    process.env.GITHUB_ACCESS_TOKEN = "ghp_" + "a".repeat(36);
    process.env.WORKER_GITHUB_ALLOWED_REPOS = "zooka-ai/chatbot";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    admin = postgres(ADMIN as string, { max: 2 });
    await admin.unsafe("select pg_advisory_lock(727272)");

    for (const name of [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0040_agent_tools_and_instructions.sql",
      "pending/0041_workspace_projects.sql",
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
    await admin`delete from "AgentDecision"`;
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A}),
                       (${AGENT_B},'b-agent','B','worker','hb',${ORG_B})`;
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end({ timeout: 5 });
  }, 30_000);

  test("a second scheduler cannot run while the first holds the lock", async () => {
    await queue(ORG_A, 1);
    const holder = postgres(ADMIN as string, { max: 1 });
    try {
      await holder`select pg_advisory_lock(${LOCK_KEY})`;
      const result = await runScheduler({ batchSize: 5, globalLimit: 5, perOrganizationLimit: 5, fetchImpl: okFetch });
      assert.equal(result.ran, false);
      assert.equal(result.reason, "overlapping_run");
      const [row] = await admin`select count(*)::int as n from "AgentTask" where status <> 'pending'`;
      assert.equal(row.n, 0, "nothing was claimed by the locked-out run");
    } finally {
      await holder`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
      await holder.end({ timeout: 5 });
    }
  });

  test("one workspace cannot exceed its own concurrency limit", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await queue(ORG_A, 3);
    const result = await runScheduler({ batchSize: 5, globalLimit: 5, perOrganizationLimit: 1, fetchImpl: okFetch });
    assert.equal(result.ran, true);
    assert.equal(result.attempted, 1, "only one task from the workspace was taken");
  });

  test("two workspaces share the batch instead of one taking all of it", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await queue(ORG_A, 3);
    await queue(ORG_B, 1);
    const result = await runScheduler({ batchSize: 2, globalLimit: 5, perOrganizationLimit: 1, fetchImpl: okFetch });
    const orgs = new Set(result.outcomes.map((o) => o.organizationId));
    assert.equal(result.attempted, 2);
    assert.equal(orgs.size, 2, "the busier workspace did not starve the quieter one");
  });

  test("the global limit caps the whole batch", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await queue(ORG_A, 2);
    await queue(ORG_B, 2);
    const result = await runScheduler({ batchSize: 5, globalLimit: 1, perOrganizationLimit: 5, fetchImpl: okFetch });
    assert.equal(result.attempted, 1);
  });

  test("a task whose worker vanished is repaired and failed, never completed", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    const [taskId] = await queue(ORG_A, 1);
    await admin`insert into "AgentExecution" ("taskId","organizationId","agentId",tool,attempt,status,"leaseExpiresAt","startedAt")
                values (${taskId}, ${ORG_A}, ${AGENT_A}, 'github_repo_inspect', 1, 'running', now() - interval '5 minutes', now() - interval '6 minutes')`;
    await admin`update "AgentTask" set status='in_progress', "ownerAgentId"=${AGENT_A} where id=${taskId}`;

    const result = await runScheduler({ batchSize: 0, globalLimit: 5, perOrganizationLimit: 5, fetchImpl: okFetch });
    assert.equal(result.reclaimed, 1, "the abandoned attempt was reclaimed");

    const [execution] = await admin`select status, error from "AgentExecution" where "taskId"=${taskId}`;
    assert.equal(execution.status, "timed_out");
    assert.equal(execution.error, "lease_expired");

    const [task] = await admin`select status, evidence from "AgentTask" where id=${taskId}`;
    assert.equal(task.status, "failed");
    assert.match(task.evidence, /Lease expired/);
  });

  test("every pass is recorded, so an idle queue can be explained", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await queue(ORG_A, 1);
    const result = await runScheduler({ batchSize: 1, globalLimit: 2, perOrganizationLimit: 1, fetchImpl: okFetch });
    const [row] = await admin`select status, "claimedCount", detail from "SchedulerRun" where id = ${String(result.schedulerRunId)}`;
    assert.ok(["finished", "idle"].includes(row.status));
    assert.equal(row.claimedCount, 1);
    assert.ok(row.detail);
  });

  test("an unauthorised tool is refused for every task and the pass still finishes", async () => {
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await queue(ORG_A, 1);
    const result = await runScheduler({ batchSize: 2, globalLimit: 2, perOrganizationLimit: 2, tool: "sql_execute", fetchImpl: okFetch });
    assert.equal(result.attempted, 1);
    assert.equal(result.outcomes[0].error, "tool_not_authorized");
    const [row] = await admin`select status from "SchedulerRun" where id = ${String(result.schedulerRunId)}`;
    assert.equal(row.status, "finished");
  });
});
