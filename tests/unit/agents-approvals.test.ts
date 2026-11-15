import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPROVAL_TTL_HOURS,
  decideApproval,
  expireStaleApprovals,
  listPendingApprovals,
  type SqlExecutor,
} from "@/lib/agents/approvals";

const MIGRATION = readFileSync(
  join(process.cwd(), "lib/db/migrations/0027_agent_command_center.sql"),
  "utf8"
);

async function freshDb() {
  const db = new PGlite();
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (sql) await db.exec(sql);
  }
  const exec: SqlExecutor = async (text, values = []) => {
    const result = await db.query(text, values as unknown[]);
    return (result.rows ?? []) as Record<string, unknown>[];
  };
  return { db, exec };
}

let seq = 0;
async function seed(exec: SqlExecutor, createdAt: Date) {
  seq += 1;
  const [agent] = await exec(
    `insert into "AgentIdentity" (slug, "displayName", role, "keyHash")
     values ($1, 'Test Agent', 'worker', 'hash') returning id`,
    [`test-agent-${seq}`]
  );
  const [task] = await exec(
    `insert into "AgentTask" (title, instruction, "ownerAgentId")
     values ('Do a thing', 'do it', $1) returning id`,
    [agent.id]
  );
  const [approval] = await exec(
    `insert into "AgentApproval" ("taskId", "requestedBy", reason, "createdAt")
     values ($1, $2, 'needs spend approval', $3) returning id`,
    [task.id, agent.id, createdAt.toISOString()]
  );
  return { agentId: agent.id as string, taskId: task.id as string, approvalId: approval.id as string };
}

test("a pending approval can be approved, and the decision is logged", async () => {
  const { exec } = await freshDb();
  const now = new Date();
  const { approvalId, taskId } = await seed(exec, now);

  const result = await decideApproval(exec, {
    id: approvalId,
    decision: "approved",
    decidedBy: "owner:helmy",
    now,
  });
  assert.deepEqual(result, { outcome: "decided", id: approvalId, status: "approved" });

  const [row] = await exec(
    `select status, "decidedBy" from "AgentApproval" where id = $1`,
    [approvalId]
  );
  assert.equal(row.status, "approved");
  assert.equal(row.decidedBy, "owner:helmy");

  const log = await exec(
    `select state, "taskId" from "AgentDecision" where "taskId" = $1`,
    [taskId]
  );
  assert.equal(log.length, 1);
  assert.equal(log[0].state, "APPROVED");
});

test("a pending approval can be refused, and refusing is final", async () => {
  const { exec } = await freshDb();
  const now = new Date();
  const { approvalId, taskId } = await seed(exec, now);

  const refused = await decideApproval(exec, {
    id: approvalId,
    decision: "rejected",
    decidedBy: "owner:helmy",
    now,
  });
  assert.deepEqual(refused, { outcome: "decided", id: approvalId, status: "rejected" });

  const again = await decideApproval(exec, {
    id: approvalId,
    decision: "approved",
    decidedBy: "owner:helmy",
    now,
  });
  assert.equal(again.outcome, "already_decided");

  const [row] = await exec(`select status from "AgentApproval" where id = $1`, [approvalId]);
  assert.equal(row.status, "rejected", "a later approve must not overwrite a refusal");

  const log = await exec(`select state from "AgentDecision" where "taskId" = $1`, [taskId]);
  assert.equal(log[0].state, "REJECTED");
});

test("a stale pending approval expires and cannot be approved afterwards", async () => {
  const { exec } = await freshDb();
  const now = new Date();
  const stale = new Date(now.getTime() - (APPROVAL_TTL_HOURS + 1) * 3600_000);
  const { approvalId } = await seed(exec, stale);

  const result = await decideApproval(exec, {
    id: approvalId,
    decision: "approved",
    decidedBy: "owner:helmy",
    now,
  });
  assert.deepEqual(result, { outcome: "expired", id: approvalId });

  const [row] = await exec(`select status from "AgentApproval" where id = $1`, [approvalId]);
  assert.equal(row.status, "expired");
});

test("sweeping expires only stale pending rows and lists only live ones", async () => {
  const { exec } = await freshDb();
  const now = new Date();
  const fresh = await seed(exec, now);
  const stale = await seed(exec, new Date(now.getTime() - (APPROVAL_TTL_HOURS + 2) * 3600_000));

  const expired = await expireStaleApprovals(exec, now);
  assert.equal(expired, 1);

  const pending = await listPendingApprovals(exec);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, fresh.approvalId);

  const [staleRow] = await exec(`select status from "AgentApproval" where id = $1`, [stale.approvalId]);
  assert.equal(staleRow.status, "expired");
});

test("deciding an unknown approval reports not_found and writes nothing", async () => {
  const { exec } = await freshDb();
  const result = await decideApproval(exec, {
    id: "00000000-0000-0000-0000-000000000000",
    decision: "approved",
    decidedBy: "owner:helmy",
  });
  assert.equal(result.outcome, "not_found");
  const log = await exec(`select count(*)::int as n from "AgentDecision"`);
  assert.equal(Number(log[0].n), 0);
});
