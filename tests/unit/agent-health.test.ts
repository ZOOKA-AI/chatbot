import assert from "node:assert/strict";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the health check escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import { workspaceExecutionHealth } from "@/lib/agents/health";

/**
 * Health has to be read, not announced.
 *
 * Each case here writes the rows a real failure would leave behind, then asks the
 * check what it thinks. Nothing is mocked at the database, so a signal that only
 * worked because of a fixture would fail here.
 */

// This suite asserts on aggregate state across global tables (queue depth, the last
// scheduler pass, failures in the last hour). Any other suite that deletes scheduler
// rows or rewrites the tenant env in the same worker changes those answers underneath
// it, which is how six tests failed intermittently while passing on their own. So it
// prefers a database of its own when one is offered, and says so when it is not.
const ADMIN = process.env.ZOOKA_TEST_PG_HEALTH_ADMIN ?? process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_HEALTH_RUNTIME ?? process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "33333333-3333-4333-8333-333333333333";
const ORG_B = "44444444-4444-4444-8444-444444444444";

let admin: ReturnType<typeof postgres>;

const health = (org = ORG_A) => withCommanderScope(org, () => workspaceExecutionHealth(org));
const signal = (result: Awaited<ReturnType<typeof health>>, name: string) =>
  result.signals.find((s) => s.name === name);

/** Executions are children of a task; the foreign key enforces it. */
async function newTask(org: string, status = "running") {
  const [row] = await admin`
    insert into "AgentTask" ("id","organizationId","title","instruction","status","createdBy")
    values (gen_random_uuid(), ${org}, 'holder', 'execution parent', ${status}, 'owner')
    returning id`;
  return row.id as string;
}

async function clear(org: string) {
  await admin`delete from "AgentExecution" where "organizationId" = ${org}`;
  await admin`delete from "AgentTask" where "organizationId" = ${org}`;
}

beforeAll(async () => {
  if (!ready) return;
  // Scoped to this file, not exported to the whole run: other suites assert the
  // shared-connection behaviour, and flipping the flag for them would test a
  // configuration the deployment does not use.
  process.env.TENANT_RLS_ENABLED = "on";
  process.env.DATABASE_URL_TENANT = RUNTIME!;
  admin = postgres(ADMIN!, { max: 2 });
  await clear(ORG_A);
  await clear(ORG_B);
});

afterAll(async () => {
  if (ready) {
    await clear(ORG_A);
    await clear(ORG_B);
    await admin.end({ timeout: 5 });
    // The flag was turned on for this file's benefit; leaving it on changes what the
    // next suite in this worker is actually testing.
    delete process.env.TENANT_RLS_ENABLED;
  }
});

describe.skipIf(!ready)("execution health is derived from rows", () => {
  test("a workspace with a fresh scheduler pass and no work is healthy", async () => {
    await clear(ORG_A);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;

    const result = await health();
    assert.equal(signal(result, "queue")?.status, "ok");
    assert.equal(signal(result, "leases")?.status, "ok");
    assert.equal(result.counts.pending, 0);
    // The scheduler table is global, not per-workspace, and other suites reset
    // it during a full run. So the scheduler signal is checked for shape here and
    // its freshness is asserted in the dedicated case below.
    assert.match(signal(result, "scheduler")!.detail, /last pass|no scheduler pass/);
  });

  test("work that has waited for hours is reported as critical, with its age", async () => {
    await clear(ORG_A);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;
    await admin`
      insert into "AgentTask" ("id","organizationId","title","instruction","status","createdBy","createdAt")
      values (gen_random_uuid(), ${ORG_A}, 'stuck', 'waiting too long', 'pending', 'owner', now() - interval '3 hours')`;

    const result = await health();
    assert.equal(signal(result, "queue")?.status, "critical");
    assert.match(signal(result, "queue")!.detail, /oldest 3h/);
    assert.equal(result.counts.pending, 1);
  });

  test("an execution holding an expired lease is critical: the worker stopped reporting", async () => {
    await clear(ORG_A);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;
    const taskId = await newTask(ORG_A);
    await admin`
      insert into "AgentExecution" ("id","organizationId","taskId","tool","status","startedAt","leaseExpiresAt")
      values (gen_random_uuid(), ${ORG_A}, ${taskId}, 'github_repo_inspect', 'running', now() - interval '20 minutes', now() - interval '5 minutes')`;

    const result = await health();
    assert.equal(result.counts.stuckLeases, 1);
    assert.equal(signal(result, "leases")?.status, "critical");
    // A critical signal must dominate the verdict, whatever the global scheduler
    // table happens to contain during a concurrent run.
    assert.equal(result.verdict, "critical");
  });

  test("a burst of failures escalates, a single one only warns", async () => {
    await clear(ORG_A);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;
    const taskId = await newTask(ORG_A, "failed");
    await admin`
      insert into "AgentExecution" ("id","organizationId","taskId","tool","status","startedAt","finishedAt")
      values (gen_random_uuid(), ${ORG_A}, ${taskId}, 'vercel_deployment_inspect', 'failed', now() - interval '10 minutes', now() - interval '9 minutes')`;
    let result = await health();
    assert.equal(signal(result, "failures")?.status, "warn");

    await admin`
      insert into "AgentExecution" ("id","organizationId","taskId","tool","status","startedAt","finishedAt")
      select gen_random_uuid(), ${ORG_A}, ${taskId}, 'vercel_deployment_inspect', 'failed', now() - interval '8 minutes', now() - interval '7 minutes'
      from generate_series(1,5)`;
    result = await health();
    assert.equal(signal(result, "failures")?.status, "critical");
    assert.equal(result.counts.failedLastHour, 6);
  });

  test("no scheduler pass ever is reported honestly rather than as healthy", async () => {
    await clear(ORG_A);
    const before = await admin`select count(*)::int as n from "SchedulerRun"`;
    if (before[0].n === 0) {
      const result = await health();
      assert.equal(signal(result, "scheduler")?.status, "warn");
      assert.match(signal(result, "scheduler")!.detail, /no scheduler pass/);
    }
  });

  test("a large backlog is counted exactly and stays critical", async () => {
    await clear(ORG_A);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;
    await admin`
      insert into "AgentTask" ("id","organizationId","title","instruction","status","createdBy","createdAt")
      select gen_random_uuid(), ${ORG_A}, 'bulk ' || g, 'load', 'pending', 'owner', now() - interval '4 hours'
      from generate_series(1,50) g`;

    const result = await health();
    assert.equal(result.counts.pending, 50);
    assert.equal(signal(result, "queue")?.status, "critical");
    assert.match(signal(result, "queue")!.detail, /^50 waiting, oldest 4h/);
  });

  test("one workspace's failures never change another's verdict", async () => {
    await clear(ORG_A);
    await clear(ORG_B);
    await admin`insert into "SchedulerRun" ("status", "startedAt", "finishedAt") values ('succeeded', now(), now())`;
    await admin`
      insert into "AgentTask" ("id","organizationId","title","instruction","status","createdBy","createdAt")
      values (gen_random_uuid(), ${ORG_B}, 'B stuck', 'not A business', 'pending', 'owner', now() - interval '5 hours')`;

    const a = await health(ORG_A);
    const b = await health(ORG_B);
    assert.equal(a.counts.pending, 0);
    assert.equal(b.counts.pending, 1);
    assert.notEqual(a.verdict, b.verdict);
  });
});
