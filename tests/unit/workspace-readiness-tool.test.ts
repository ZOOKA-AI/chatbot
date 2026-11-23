import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { runWithCommanderDb } from "@/lib/db/tenant-context";
import * as schema from "@/lib/db/schema";
import { workspaceReadinessInspect } from "@/lib/agents/worker-tools/workspace-readiness";

vi.mock("server-only", () => ({}));

/**
 * The one action a customer can run with no external account.
 *
 * Because it is the proof that execution works at all, its numbers have to be real and scoped:
 * a report that counted another workspace's tasks would be worse than no report.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let pg: PGlite;

const apply = async (file: string) => {
  for (const part of readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8").split("--> statement-breakpoint")) {
    if (part.trim()) await pg.exec(part);
  }
};

beforeEach(async () => {
  pg = new PGlite();
  await apply("0027_agent_command_center.sql");
  await apply("pending/0028_agent_tenant_scope.sql");
  await apply("pending/0033_decision_audit_uniqueness.sql");
  await apply("pending/0034_agent_execution.sql");
  await apply("pending/0035_worker_lease_and_scheduler.sql");
  await apply("pending/0038_schedule_and_agent_model.sql");
  await apply("pending/0040_agent_tools_and_instructions.sql");
  await apply("pending/0041_workspace_projects.sql");
  await apply("pending/0068_agent_permissions.sql");
});

afterEach(async () => {
  await pg.close();
});

async function seed() {
  const db = drizzle(pg, { schema });
  await db.insert(schema.agentIdentity).values([
    { organizationId: A, slug: "a-one", displayName: "A one", role: "researcher", keyHash: "h1", allowedTools: ["workspace_readiness_inspect"] },
    { organizationId: A, slug: "a-two", displayName: "A two", role: "researcher", keyHash: "h2", allowedTools: ["workspace_readiness_inspect"], status: "disabled" },
    { organizationId: B, slug: "b-one", displayName: "B one", role: "researcher", keyHash: "h3", allowedTools: ["workspace_readiness_inspect"] },
  ]);
  await db.insert(schema.agentTask).values(([
    { organizationId: A, title: "A pending", instruction: "Run the readiness report", status: "pending", payload: {} },
    { organizationId: A, title: "A done", instruction: "Run the readiness report", status: "completed", payload: {} },
    { organizationId: B, title: "B pending", instruction: "Run the readiness report", status: "pending", payload: {} },
    { organizationId: B, title: "B pending", instruction: "Run the readiness report", status: "pending", payload: {} },
  ] as (typeof schema.agentTask.$inferInsert)[]));
  return db;
}

const run = (db: Awaited<ReturnType<typeof seed>>, organizationId: string, payload: Record<string, unknown>) =>
  runWithCommanderDb(db, () =>
    workspaceReadinessInspect.run({
      organizationId,
      agentId: "agent",
      payload,
      signal: new AbortController().signal,
      fetchImpl: fetch,
    })
  );

describe("workspace readiness report", () => {
  test("counts only the caller's own workspace", async () => {
    const db = await seed();
    const result = await run(db, A, { label: "Monday report" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.summary, /2 task\(s\) \(1 pending\)/, result.summary);
    assert.match(result.summary, /2 agent\(s\) \(1 active\)/, "A owns two agents, one of them disabled");
    assert.doesNotMatch(result.summary, /3 agent\(s\)/, "the third agent belongs to B and must not appear");
    assert.doesNotMatch(result.summary, /4 task\(s\)/, "B's tasks must not appear");
  });

  test("says what needs attention instead of implying health", async () => {
    const db = await seed();
    const result = await run(db, A, { label: "Monday report" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.summary, /waiting for a worker/);
    assert.deepEqual((result.evidence as { tasks: Record<string, number> }).tasks, { completed: 1, pending: 1 });
  });

  test("a run with no rows reports zero rather than failing", async () => {
    const db = await seed();
    const result = await run(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", { label: "Empty workspace" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.summary, /0 agent\(s\)/);
    assert.match(result.summary, /no agent exists yet/);
  });

  test("a bad label is refused before any read", async () => {
    const db = await seed();
    const short = await run(db, A, { label: "ab" });
    assert.equal(short.ok, false);
    if (!short.ok) assert.equal(short.error, "invalid_label");
    const missing = await run(db, A, {});
    assert.equal(missing.ok, false);
  });

  test("a cancelled run does not read and does not claim success", async () => {
    const db = await seed();
    const controller = new AbortController();
    controller.abort();
    const result = await runWithCommanderDb(db, () =>
      workspaceReadinessInspect.run({
        organizationId: A,
        agentId: "agent",
        payload: { label: "Cancelled" },
        signal: controller.signal,
        fetchImpl: fetch,
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "aborted");
  });

  test("the tool is registered read-only and cannot write", async () => {
    assert.equal(workspaceReadinessInspect.readOnly, true);
    const db = await seed();
    const before = await db.select().from(schema.agentTask).where(eq(schema.agentTask.organizationId, A));
    await run(db, A, { label: "No side effects" });
    const after = await db.select().from(schema.agentTask).where(eq(schema.agentTask.organizationId, A));
    assert.deepEqual(after.map((r) => r.status), before.map((r) => r.status));
  });
});
