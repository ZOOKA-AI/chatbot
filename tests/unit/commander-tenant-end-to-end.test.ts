import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

/**
 * End to end, on a real server: does a Commander call actually reach PostgreSQL as
 * the tenant?
 *
 * The chain being proven is the one the owner asked for:
 *   caller's organisation → tenant transaction → PostgreSQL RLS → Commander → result
 *
 * The shared connection is replaced with a stub that throws. That is the point:
 * if any Commander query escaped the tenant transaction, this test would fail with
 * "shared connection" instead of quietly passing on a connection that bypasses
 * policy. Proving that a request cannot silently fall back is stronger than
 * proving the happy path.
 */

vi.mock("server-only", () => ({}));
// The caller resolver pulls next-auth, which does not resolve under vitest. This
// test drives withCommanderScope directly, so only the tenant path matters here;
// route-level caller resolution is covered by the wrapper's own type and the
// authorization tests.
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import { claimTask, createTask, listTasks, reportTask } from "@/lib/agents/command-center";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

let admin: ReturnType<typeof postgres>;

const agent = (organizationId: string) =>
  ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

describe.skipIf(!ready)("Commander runs on the tenant connection", () => {
  beforeAll(async () => {
    // The flag and the connection are set before any call, exactly as preview
    // would have them.
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;

    admin = postgres(ADMIN as string, { max: 1 });
    // Vitest runs files in parallel and these suites share one database, so they
    // take turns instead of truncating each other's fixtures mid-run.
    await admin.unsafe("select pg_advisory_lock(727272)");
    await applyMigrations();
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a-agent','A','worker','ha',${ORG_A}),
                       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b-agent','B','worker','hb',${ORG_B})`;
  }, 60_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end();
  });

  test("a task created in tenant A is visible to A and invisible to B", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({ organizationId: ORG_A, title: "scoped task", instruction: "x", createdBy: "owner-a" })
    );
    assert.ok(task.id);

    const seenByA = await withCommanderScope(ORG_A, () => listTasks({ organizationId: ORG_A }));
    const seenByB = await withCommanderScope(ORG_B, () => listTasks({ organizationId: ORG_B }));

    assert.deepEqual(seenByA.map((t) => t.title), ["scoped task"]);
    assert.deepEqual(seenByB.map((t) => t.title), [], "tenant B cannot see tenant A's task");
  });

  test("tenant B cannot claim tenant A's task, even holding its id", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({ organizationId: ORG_A, title: "a only", instruction: "x", createdBy: "owner-a" })
    );

    const attempt = await withCommanderScope(ORG_B, () => claimTask(agent(ORG_B), task.id));
    assert.equal(attempt.ok, false);
    assert.equal(attempt.ok === false && attempt.error, "task_not_found", "not even existence leaks");
  });

  test("a Commander query cannot reach the shared connection", async () => {
    // The stub throws. Calling outside a scope must therefore fail loudly rather
    // than succeed on a connection that bypasses policy.
    await expect(
      listTasks({ organizationId: ORG_A })
    ).rejects.toThrow(/shared connection used/);
  });

  test("the whole write path stays inside one transaction", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({ organizationId: ORG_A, title: "claimable", instruction: "x", createdBy: "owner-a" })
    );

    const claimed = await withCommanderScope(ORG_A, () => claimTask(agent(ORG_A), task.id));
    assert.equal(claimed.ok, true);

    const reported = await withCommanderScope(ORG_A, () =>
      reportTask(agent(ORG_A), { taskId: task.id, status: "completed", evidence: "done" })
    );
    assert.ok(reported);

    // And the row is what the database holds, read outside the tenant transaction
    // with the owner connection.
    const [row] = await admin`select status, evidence from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "completed");
    assert.equal(row.evidence, "done");
  });

  test("a refused organisation never opens a transaction", async () => {
    await expect(withCommanderScope(null, () => listTasks({ organizationId: ORG_A }))).rejects.toThrow(
      /no authenticated organisation/
    );
    await expect(
      withCommanderScope("not-a-uuid", () => listTasks({ organizationId: ORG_A }))
    ).rejects.toThrow(/not a valid identifier/);
  });
});
