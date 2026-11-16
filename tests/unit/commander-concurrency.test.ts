import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * Commander concurrency and authorization.
 *
 * These are the cases where two callers act at once, or where one caller is not
 * entitled to act at all. The point is not that the code "returns an error" but
 * that a rejected, cancelled or already-claimed task cannot be executed anyway,
 * and that the loser of a race learns it lost.
 *
 * Real PostgreSQL (PGlite 18.6) with the actual migration chain, and the real
 * command-center functions through a mocked db seam.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  cancelTask,
  claimTask,
  decideApproval,
  reportTask,
  requestApproval,
  createTask,
} from "@/lib/agents/command-center";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

const A_ID = "11111111-1111-4111-8111-111111111111";
const B_ID = "22222222-2222-4222-8222-222222222222";
const ORG_A = "org-alpha";
const ORG_B = "org-beta";

function agent(organizationId: string, id = A_ID) {
  return {
    id,
    organizationId,
    slug: "a-agent",
    displayName: "A",
    role: "worker" as const,
    scopes: ["task:claim", "task:report"] as const,
  } as never;
}

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/0027_agent_command_center.sql"), "utf8"));
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0028_agent_tenant_scope.sql"), "utf8"));
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0033_decision_audit_uniqueness.sql"), "utf8"));
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0038_schedule_and_agent_model.sql"), "utf8"));
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0039_launch_plan.sql"), "utf8"));
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0040_agent_tools_and_instructions.sql"), "utf8"));
  db = drizzle(pg, { schema });
  holder.db = db;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  for (const table of ["AgentApproval", "AgentTask", "AgentDecision", "AgentDeployment", "AgentIdentity"]) {
    await pg.exec(`delete from "${table}"`);
  }
  await pg.query(
    `insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
     values ($3,'a-agent','A','worker','ha',$1), ($4,'b-agent','B','worker','hb',$2)`,
    [ORG_A, ORG_B, A_ID, B_ID]
  );
});

async function newTask(organizationId = ORG_A) {
  return createTask({
    organizationId,
    title: "task",
    instruction: "do it",
    createdBy: "owner-1",
  });
}

describe("claiming", () => {
  test("two agents claiming at once: one wins, the other learns it lost", async () => {
    const task = await newTask();
    const [first, second] = await Promise.all([
      claimTask(agent(ORG_A, A_ID), task.id),
      claimTask(agent(ORG_A, A_ID), task.id),
    ]);

    const winners = [first, second].filter((r) => r.ok);
    assert.equal(winners.length, 1, "a task cannot be claimed twice");
    const loser = [first, second].find((r) => !r.ok);
    assert.equal(loser && loser.error, "task_already_claimed");
  });

  test("an agent from another organisation cannot claim the task at all", async () => {
    const task = await newTask(ORG_A);
    const result = await claimTask(agent(ORG_B, B_ID), task.id);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "task_not_found", "not even existence leaks");
  });

  test("a cancelled task cannot be claimed", async () => {
    const task = await newTask();
    await cancelTask({ organizationId: ORG_A, taskId: task.id, reason: "owner stopped it", by: "owner-1" });

    const result = await claimTask(agent(ORG_A, A_ID), task.id);
    assert.equal(result.ok, false);
  });
});

describe("approvals", () => {
  let taskId: string;
  let approvalId: string;

  beforeEach(async () => {
    const task = await newTask();
    taskId = task.id;
    const approval = await requestApproval(agent(ORG_A, A_ID), {
      organizationId: ORG_A,
      taskId,
      reason: "spends money",
    });
    approvalId = approval.id;
  });

  test("simultaneous approve and reject: exactly one decision sticks", async () => {
    const results = await Promise.all([
      decideApproval({ organizationId: ORG_A, approvalId, decision: "approved", decidedBy: "owner-1" }),
      decideApproval({ organizationId: ORG_A, approvalId, decision: "rejected", reason: "not safe", decidedBy: "owner-1" }),
    ]);

    const applied = results.filter(Boolean);
    assert.equal(applied.length, 1, "a pending approval can be decided once");

    const { rows } = await pg.query<{ status: string }>(
      `select status from "AgentApproval" where id = $1`,
      [approvalId]
    );
    assert.ok(["approved", "rejected"].includes(rows[0].status));
    assert.equal(rows[0].status, applied[0]!.status, "the stored value is the winner's");
  });

  test("a second decision after the first changes nothing", async () => {
    const first = await decideApproval({
      organizationId: ORG_A,
      approvalId,
      decision: "approved",
      decidedBy: "owner-1",
    });
    const second = await decideApproval({
      organizationId: ORG_A,
      approvalId,
      decision: "rejected", reason: "not safe", decidedBy: "owner-1",
    });

    assert.ok(first);
    assert.equal(second, null, "nothing to decide the second time");
  });

  test("another organisation cannot decide it", async () => {
    const result = await decideApproval({
      organizationId: ORG_B,
      approvalId,
      decision: "approved",
      decidedBy: "owner-2",
    });
    assert.equal(result, null);

    const { rows } = await pg.query<{ status: string }>(
      `select status from "AgentApproval" where id = $1`,
      [approvalId]
    );
    assert.equal(rows[0].status, "pending", "the other tenant changed nothing");
  });

  test("a rejected task is never executable, even if someone claims it directly", async () => {
    await decideApproval({ organizationId: ORG_A, approvalId, decision: "rejected", reason: "not safe", decidedBy: "owner-1" });
    await pg.query(`update "AgentTask" set "approvalRequired" = true where id = $1`, [taskId]);

    const claim = await claimTask(agent(ORG_A, A_ID), taskId);
    assert.equal(claim.ok, false);
    assert.equal(claim.ok === false && claim.error, "approval_rejected");
  });

  test("an approved task becomes claimable", async () => {
    await decideApproval({ organizationId: ORG_A, approvalId, decision: "approved", decidedBy: "owner-1" });
    await pg.query(`update "AgentTask" set "approvalRequired" = true where id = $1`, [taskId]);

    const claim = await claimTask(agent(ORG_A, A_ID), taskId);
    assert.equal(claim.ok, true);
  });
});

describe("cancellation during execution", () => {
  test("a cancelled task cannot be reported as completed afterwards", async () => {
    const task = await newTask();
    const claimed = await claimTask(agent(ORG_A, A_ID), task.id);
    assert.equal(claimed.ok, true);

    // The owner cancels while the agent is mid-run.
    const cancelled = await cancelTask({
      organizationId: ORG_A,
      taskId: task.id,
      reason: "owner cancelled",
      by: "owner-1",
    });
    assert.ok(cancelled, "in_progress work can be cancelled");

    const report = await reportTask(agent(ORG_A, A_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "done anyway",
    });
    assert.equal(report, null, "cancelled work must not be resurrected as completed");

    const { rows } = await pg.query<{ status: string }>(
      `select status from "AgentTask" where id = $1`,
      [task.id]
    );
    assert.equal(rows[0].status, "cancelled");
  });

  test("cancelling twice is harmless and the second attempt returns nothing", async () => {
    const task = await newTask();
    const first = await cancelTask({ organizationId: ORG_A, taskId: task.id, reason: "r", by: "o" });
    const second = await cancelTask({ organizationId: ORG_A, taskId: task.id, reason: "r2", by: "o" });
    assert.ok(first);
    assert.equal(second, null);
  });

  test("another organisation cannot cancel the task", async () => {
    const task = await newTask(ORG_A);
    const result = await cancelTask({ organizationId: ORG_B, taskId: task.id, reason: "x", by: "owner-2" });
    assert.equal(result, null);
  });
});

describe("reporting and idempotency", () => {
  test("a duplicate completion report does not rewrite a finished result", async () => {
    const task = await newTask();
    await claimTask(agent(ORG_A, A_ID), task.id);

    const first = await reportTask(agent(ORG_A, A_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "the real result",
    });
    const second = await reportTask(agent(ORG_A, A_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "a different story",
    });

    assert.ok(first);
    assert.equal(second, null, "a completed task is terminal");

    const { rows } = await pg.query<{ evidence: string }>(
      `select evidence from "AgentTask" where id = $1`,
      [task.id]
    );
    assert.equal(rows[0].evidence, "the real result");
  });

  test("a retry may report again from a failed state", async () => {
    const task = await newTask();
    await claimTask(agent(ORG_A, A_ID), task.id);
    await reportTask(agent(ORG_A, A_ID), { taskId: task.id, status: "failed", evidence: "timeout" });
    const retried = await reportTask(agent(ORG_A, A_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "worked on retry",
    });
    assert.ok(retried, "a failed task can be retried and settled");
  });

  test("an agent cannot report on work it did not claim", async () => {
    const task = await newTask(ORG_A);
    const result = await reportTask(agent(ORG_A, B_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "not mine",
    });
    assert.equal(result, null, "ownerAgentId must match the caller");
  });

  test("an agent from another organisation cannot report", async () => {
    const task = await newTask(ORG_A);
    await claimTask(agent(ORG_A, A_ID), task.id);
    const result = await reportTask(agent(ORG_B, B_ID), {
      taskId: task.id,
      status: "completed",
      evidence: "cross tenant",
    });
    assert.equal(result, null);
  });

  test("reporting a task that does not exist is null, not an exception", async () => {
    const result = await reportTask(agent(ORG_A, A_ID), {
      taskId: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      evidence: "x",
    });
    assert.equal(result, null);
  });
});
