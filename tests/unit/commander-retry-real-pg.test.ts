import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

/**
 * The retry path on a real server, inside the tenant transaction.
 *
 * The shared connection is a stub that throws, so these tests also prove that
 * nothing here escapes to a connection where RLS would not apply.
 */

vi.mock("server-only", () => ({}));
// commander-scope imports the caller resolver, which pulls next-auth (unresolved
// under vitest). These tests call the domain functions directly.
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import {
  claimTask,
  createTask,
  decideApproval,
  listTaskHistory,
  reportTask,
  requestApproval,
  retryTask,
} from "@/lib/agents/command-center";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let admin: ReturnType<typeof postgres>;

const agent = (organizationId = ORG_A) =>
  ({
    id: AGENT_A,
    organizationId,
    slug: "a-agent",
    displayName: "A",
    role: "worker",
  }) as never;

async function applyMigrations() {
  const files = [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0030_agent_rls_policies.sql",
    "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
  ];
  for (const name of files) {
    const body = readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
    for (const part of body.split("--> statement-breakpoint")) {
      const statement = part.trim();
      if (!statement) continue;
      try {
        await admin.unsafe(statement);
      } catch (error) {
        if (!/already exists|does not exist/i.test((error as Error).message)) throw error;
      }
    }
  }
}

/** Runs a task to a given terminal state using the real functions. */
async function taskIn(state: "failed" | "completed" | "in_progress") {
  const task = await withCommanderScope(ORG_A, () =>
    createTask({ organizationId: ORG_A, title: "retry me", instruction: "x", createdBy: "owner-a" })
  );
  await withCommanderScope(ORG_A, () => claimTask(agent(), task.id));
  if (state === "in_progress") return task;
  await withCommanderScope(ORG_A, () =>
    reportTask(agent(), {
      taskId: task.id,
      status: state,
      evidence: state === "failed" ? "the key rotation returned 403" : "done",
    })
  );
  return task;
}

describe.skipIf(!ready)("retry on real PostgreSQL, inside the tenant transaction", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    admin = postgres(ADMIN as string, { max: 1 });
    // Vitest runs files in parallel and these suites share one database, so they
    // take turns instead of truncating each other's fixtures mid-run.
    await admin.unsafe("select pg_advisory_lock(727272)");
    await applyMigrations();
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentDecision"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A}),
                       (gen_random_uuid(),'b-agent','B','worker','hb',${ORG_B})`;
  }, 60_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end();
  });

  test("a failed task returns to the queue with its failure cleared", async () => {
    const task = await taskIn("failed");

    const result = await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "key rotated" })
    );
    assert.equal(result.ok, true);

    const [row] = await admin`select status, evidence, "ownerAgentId", "claimedAt", "reportedAt"
                             from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "pending");
    assert.equal(row.evidence, null, "the old error does not follow the task");
    assert.equal(row.ownerAgentId, null, "the task is free for any agent to claim");
    assert.equal(row.claimedAt, null);
    assert.equal(row.reportedAt, null);
  });

  test("the retry is recorded as history, with its reason", async () => {
    const task = await taskIn("failed");
    await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "transient 503" })
    );

    const history = await withCommanderScope(ORG_A, () => listTaskHistory(ORG_A, task.id));
    const retry = history.find((h) => h.state === "RETRY");
    assert.ok(retry, "a RETRY decision exists");
    assert.match(String(retry?.body), /transient 503/);
    assert.match(String(retry?.body), /failed/, "it records what the status was");
  });

  test("completed work is not retryable", async () => {
    const task = await taskIn("completed");
    const result = await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "again" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "not_retryable");
  });

  test("running work is not retryable: it must be cancelled first", async () => {
    const task = await taskIn("in_progress");
    const result = await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "again" })
    );
    assert.equal(result.ok === false && result.error, "not_retryable");
  });

  test("a rejected approval never becomes an executed task", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({
        organizationId: ORG_A,
        title: "needs a human",
        instruction: "x",
        createdBy: "owner-a",
        approvalRequired: true,
      })
    );
    const approval = await withCommanderScope(ORG_A, () =>
      requestApproval(agent(), { organizationId: ORG_A, taskId: task.id, reason: "spends money" })
    );
    await withCommanderScope(ORG_A, () =>
      decideApproval({ organizationId: ORG_A, approvalId: approval.id, decision: "rejected", reason: "not safe", decidedBy: "o" })
    );

    // Stronger than expected: a required approval that is merely pending already
    // blocks claiming, so a rejected task cannot be started at all.
    const claimed = await withCommanderScope(ORG_A, () => claimTask(agent(), task.id));
    assert.equal(claimed.ok, false, "a rejected task cannot be claimed");
    assert.match(String((claimed as { error?: string }).error ?? ""), /approval/);

    // And it is not retryable, because it never ran.
    const result = await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "please" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "not_retryable");
  });

  test("the retry guard refuses a rejected approval even if a row arrives in that shape", async () => {
    // Defence in depth, tested directly: the normal flow cannot produce this row,
    // but an older record, or a flag flipped after the fact, could. Retrying must
    // still not become a way around a refusal.
    const task = await withCommanderScope(ORG_A, () =>
      createTask({
        organizationId: ORG_A,
        title: "legacy row",
        instruction: "x",
        createdBy: "owner-a",
        approvalRequired: true,
      })
    );
    const approval = await withCommanderScope(ORG_A, () =>
      requestApproval(agent(), { organizationId: ORG_A, taskId: task.id, reason: "spends money" })
    );
    await withCommanderScope(ORG_A, () =>
      decideApproval({ organizationId: ORG_A, approvalId: approval.id, decision: "rejected", reason: "not safe", decidedBy: "o" })
    );
    await admin`update "AgentTask" set status = 'failed' where id = ${task.id}`;

    const result = await withCommanderScope(ORG_A, () =>
      retryTask({ organizationId: ORG_A, taskId: task.id, by: "owner-a", reason: "please" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "approval_rejected");
  });

  test("another tenant cannot retry, or even find, this task", async () => {
    const task = await taskIn("failed");
    const result = await withCommanderScope(ORG_B, () =>
      retryTask({ organizationId: ORG_B, taskId: task.id, by: "owner-b", reason: "mine now" })
    );
    assert.equal(result.ok === false && result.error, "task_not_found");

    const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "failed", "tenant B changed nothing");
  });

  test("outside a tenant scope the Commander will not run at all", async () => {
    // The shared connection is a stub that throws, so an unscoped call cannot
    // quietly succeed somewhere RLS does not apply.
    await expect(
      retryTask({ organizationId: ORG_A, taskId: AGENT_A, by: "x", reason: "y" })
    ).rejects.toThrow(/shared connection used/);
  });
});
