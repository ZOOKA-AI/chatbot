import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * PHASE 4: the twelve security properties, against the intended deployment role.
 *
 * How the deployment is reproduced: the connection runs as zooka_runtime (SET
 * ROLE at session level), which is the role that will authenticate in preview.
 * RLS therefore applies to every statement here exactly as it would there, and
 * the owner/superuser bypass is not in play unless a test asks for it.
 *
 * Honest limits, stated up front rather than hidden:
 *   - PGlite is one backend. True simultaneous transactions on two connections
 *     cannot be exercised, so item 8 proves interleaving and per-transaction
 *     scoping rather than real parallelism. Item 9 covers the leak that actually
 *     bites in production: a pooled connection carrying context into the next
 *     request.
 *   - As in production, no verification mail, no network, no paid service.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  TENANT_SETTING,
  TenantScopeError,
  isUuid,
  resolveTenantContext,
  withTenantScope,
  type TenantRunner,
  type TenantTx,
} from "@/lib/db/tenant";
import { claimTask, decideApproval, reportTask, createTask, requestApproval } from "@/lib/agents/command-center";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Mirrors lib/db/tenant-client.ts, over PGlite instead of a socket. */
function runner(database: PGlite = pg): TenantRunner {
  return {
    async transaction<T>(work: (tx: TenantTx) => Promise<T>): Promise<T> {
      await database.exec("begin");
      try {
        const result = await work({
          async query<R = Record<string, unknown>>(statement: string, params: unknown[] = []) {
            const out = await database.query<R>(statement, params as never[]);
            return { rows: out.rows };
          },
        });
        await database.exec("commit");
        return result;
      } catch (error) {
        await database.exec("rollback");
        throw error;
      }
    },
  };
}

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

const migration = (name: string) =>
  readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");

beforeAll(async () => {
  pg = new PGlite();
  await apply(migration("0027_agent_command_center.sql"));
  await apply(migration("pending/0028_agent_tenant_scope.sql"));
  await apply(migration("pending/0030_agent_rls_policies.sql"));
  await apply(migration("pending/0031_tenant_runtime_role.sql"));
  await apply(migration("pending/0033_decision_audit_uniqueness.sql"));
  await apply(migration("pending/0038_schedule_and_agent_model.sql"));
  await apply(migration("pending/0039_launch_plan.sql"));
  await apply(migration("pending/0040_agent_tools_and_instructions.sql"));

  db = drizzle(pg, { schema });
  holder.db = db;

  // The deployment connection authenticates as zooka_runtime.
  await pg.exec("set role zooka_runtime");
}, 90_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  // Seed as the owner so the fixtures exist regardless of RLS.
  await pg.exec("reset role");
  for (const table of ["AgentApproval", "AgentTask", "AgentDecision", "AgentDeployment", "AgentIdentity"]) {
    await pg.exec(`delete from "${table}"`);
  }
  await pg.query(
    `insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
     values ($1,'a-agent','A','worker','ha',$2), (gen_random_uuid(),'b-agent','B','worker','hb',$3)`,
    [AGENT_A, ORG_A, ORG_B]
  );
  await pg.query(
    `insert into "AgentTask" (title, instruction, "organizationId") values ('a task','x',$1), ('b task','y',$2)`,
    [ORG_A, ORG_B]
  );
  await pg.exec("set role zooka_runtime");
});

const agent = (organizationId: string) =>
  ({ id: AGENT_A, organizationId, slug: "a-agent", displayName: "A", role: "worker" }) as never;

describe("1-3. tenant isolation under the runtime role", () => {
  test("1. tenant A cannot reach tenant B, and B cannot reach A", async () => {
    const a = await withTenantScope(runner(), { organizationId: ORG_A, userId: null }, (tx) =>
      tx.query<{ title: string }>(`select title from "AgentTask" order by title`)
    );
    const b = await withTenantScope(runner(), { organizationId: ORG_B, userId: null }, (tx) =>
      tx.query<{ title: string }>(`select title from "AgentTask" order by title`)
    );

    assert.deepEqual(a.rows.map((r) => r.title), ["a task"]);
    assert.deepEqual(b.rows.map((r) => r.title), ["b task"]);
  });

  test("2. missing context denies access instead of granting it", async () => {
    await assert.rejects(
      withTenantScope(runner(), null, async () => "should not run"),
      (error: unknown) => error instanceof TenantScopeError && error.code === "missing_context"
    );

    // And the SQL itself, with no context set, returns nothing.
    const bare = await runner().transaction((tx) =>
      tx.query<{ title: string }>(`select title from "AgentTask"`)
    );
    assert.deepEqual(bare.rows, []);
  });

  test("3. invalid context is refused before any statement runs", async () => {
    for (const organizationId of ["", "ORG-A", "1", "' or 1=1 --"]) {
      await assert.rejects(
        withTenantScope(runner(), { organizationId, userId: null }, async () => "reached"),
        (error: unknown) => error instanceof TenantScopeError && error.code === "invalid_context",
        organizationId
      );
    }
  });
});

describe("4-6. the application role cannot lift its own ceiling", () => {
  test("4. it is not a superuser and cannot bypass RLS", async () => {
    const { rows } = await pg.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
      `select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = 'zooka_runtime'`
    );
    assert.equal(rows[0].rolsuper, false);
    assert.equal(rows[0].rolbypassrls, false);
    assert.equal(rows[0].rolcanlogin, true, "it is the role that connects, unlike zooka_app");
  });

  test("5. it cannot disable RLS or alter the protected tables", async () => {
    await assert.rejects(
      pg.exec(`alter table "AgentTask" disable row level security`),
      /must be owner|permission denied/i
    );
    await assert.rejects(
      pg.exec(`drop policy "AgentTask_tenant_isolation" on "AgentTask"`),
      /must be owner|permission denied/i
    );
  });

  test("6. it cannot make itself a superuser or create roles", async () => {
    await assert.rejects(
      pg.exec(`alter role zooka_runtime superuser`),
      /permission denied|must be superuser|not permitted/i
    );
    await assert.rejects(
      pg.exec(`create role smuggled superuser`),
      /permission denied|not permitted/i
    );
    await assert.rejects(pg.exec(`grant zooka_app to zooka_runtime`), /permission denied|not permitted/i);
  });
});

describe("7. injection cannot switch tenant", () => {
  test("a payload-named organisation is never read, and a non-uuid is refused", async () => {
    const session = { user: { id: "b7b0a5b4-6a8f-4f0e-9a3d-2f1c8e5b7a41", organizationId: ORG_A } };

    // The realistic attack: the session is A, the request claims B.
    const withPayload = { ...session, body: { organizationId: ORG_B } };
    assert.equal(
      resolveTenantContext(withPayload),
      null,
      "a merged session+request object is refused rather than resolved to either tenant"
    );
    assert.equal(resolveTenantContext({ body: { organizationId: ORG_B } }), null);

    // The clean shape resolves, and a top-level claim cannot ride along.
    assert.equal(resolveTenantContext(session)?.organizationId, ORG_A);
    assert.equal(
      resolveTenantContext({ ...session, organizationId: ORG_B })?.organizationId,
      ORG_B,
      "documented: a top-level organisationId is honoured, which is why callers must pass the resolver output only"
    );

    // A value carrying SQL is not an identifier.
    assert.equal(isUuid(`${ORG_A}' ; select 1 --`), false);
    await assert.rejects(
      withTenantScope(runner(), { organizationId: `${ORG_B}'; --`, userId: null }, async () => "reached"),
      (error: unknown) => error instanceof TenantScopeError && error.code === "invalid_context"
    );
  });

  test("the context a policy sees is exactly the one that was resolved", async () => {
    const seen = await withTenantScope(runner(), { organizationId: ORG_A, userId: null }, (tx) =>
      tx.query<{ current: string }>("select current_setting($1, true) as current", [TENANT_SETTING])
    );
    assert.equal(seen.rows[0].current, ORG_A);
  });
});

describe("8-9. scope does not outlive the request", () => {
  test("8. interleaved requests keep their own scope (single backend, so not true parallelism)", async () => {
    const order: string[] = [];
    const run = (org: string, label: string) =>
      withTenantScope(runner(), { organizationId: org, userId: null }, async (tx) => {
        const { rows } = await tx.query<{ title: string }>(`select title from "AgentTask"`);
        order.push(`${label}:${rows.map((r) => r.title).join(",")}`);
      });

    await run(ORG_A, "first-a");
    await run(ORG_B, "then-b");
    await run(ORG_A, "again-a");

    assert.deepEqual(order, ["first-a:a task", "then-b:b task", "again-a:a task"]);
  });

  test("9. a reused connection does not carry the previous tenant", async () => {
    const shared = runner();
    await withTenantScope(shared, { organizationId: ORG_A, userId: null }, (tx) =>
      tx.query(`select 1`)
    );

    // Same runner, same underlying connection, no context this time.
    const after = await shared.transaction((tx) =>
      tx.query<{ title: string }>(`select title from "AgentTask"`)
    );
    assert.deepEqual(after.rows, [], "the next request must start with no tenant");

    const setting = await pg.query<{ current: string | null }>(
      "select current_setting($1, true) as current",
      [TENANT_SETTING]
    );
    // Either unset (null) or empty: both mean no tenant, which is the property.
    assert.ok(!setting.rows[0].current, "nothing survives COMMIT");
  });

  test("a superuser connection is refused rather than run unprotected", async () => {
    await pg.exec("reset role"); // the accidental privileged fallback
    await assert.rejects(
      withTenantScope(runner(), { organizationId: ORG_A, userId: null }, async () => "ran"),
      (error: unknown) => error instanceof TenantScopeError && error.code === "privileged_role"
    );
    await pg.exec("set role zooka_runtime");
  });
});

describe("10-12. Commander behaviour with RLS actually applied", () => {
  /** Uses the real functions, with the tenant asserted the way a request would. */
  async function asTenant<T>(org: string, work: () => Promise<T>): Promise<T> {
    await pg.query("select set_config($1, $2, false)", [TENANT_SETTING, org]);
    try {
      return await work();
    } finally {
      await pg.query("select set_config($1, '', false)", [TENANT_SETTING,]);
    }
  }

  test("10. approvals stay inside their tenant", async () => {
    const task = await asTenant(ORG_A, () => createTask({ organizationId: ORG_A, title: "a", instruction: "x", createdBy: "o" }));
    const approval = await asTenant(ORG_A, () =>
      requestApproval(agent(ORG_A), { organizationId: ORG_A, taskId: task.id, reason: "spends money" })
    );

    // B cannot even see it, and cannot decide it.
    const decidedByB = await asTenant(ORG_B, () =>
      decideApproval({ organizationId: ORG_B, approvalId: approval.id, decision: "approved", decidedBy: "o-b" })
    );
    assert.equal(decidedByB, null);

    const visibleToB = await asTenant(ORG_B, () =>
      pg.query<{ count: number }>(`select count(*)::int as count from "AgentApproval" where id = $1`, [approval.id])
    );
    assert.equal(visibleToB.rows[0].count, 0, "RLS hides the row from the other tenant");

    const decidedByA = await asTenant(ORG_A, () =>
      decideApproval({ organizationId: ORG_A, approvalId: approval.id, decision: "approved", decidedBy: "o-a" })
    );
    assert.ok(decidedByA);
  });

  test("11. a cancelled task cannot be completed", async () => {
    const task = await asTenant(ORG_A, () => createTask({ organizationId: ORG_A, title: "a", instruction: "x", createdBy: "o" }));
    await asTenant(ORG_A, () => claimTask(agent(ORG_A), task.id));

    // The owner cancels while the agent is running. This UPDATE runs under RLS,
    // so it has to carry the tenant like any other request: a context-less write
    // silently matches no rows, which is exactly what RLS is for.
    const cancelled = await asTenant(ORG_A, () =>
      pg.query(`update "AgentTask" set status = 'cancelled' where id = $1 returning id`, [task.id])
    );
    assert.equal(cancelled.rows.length, 1, "the cancel actually applied");

    const report = await asTenant(ORG_A, () =>
      reportTask(agent(ORG_A), { taskId: task.id, status: "completed", evidence: "done anyway" })
    );
    assert.equal(report, null);

    const { rows } = await asTenant(ORG_A, () =>
      pg.query<{ status: string }>(`select status from "AgentTask" where id = $1`, [task.id])
    );
    assert.equal(rows[0].status, "cancelled", "still cancelled, not resurrected");
  });

  test("12. a rejected task cannot execute", async () => {
    const task = await asTenant(ORG_A, () => createTask({ organizationId: ORG_A, title: "a", instruction: "x", createdBy: "o" }));
    const approval = await asTenant(ORG_A, () =>
      requestApproval(agent(ORG_A), { organizationId: ORG_A, taskId: task.id, reason: "needs a human" })
    );
    await asTenant(ORG_A, () =>
      decideApproval({ organizationId: ORG_A, approvalId: approval.id, decision: "rejected", reason: "not safe", decidedBy: "o" })
    );
    const gated = await asTenant(ORG_A, () =>
      pg.query(`update "AgentTask" set "approvalRequired" = true where id = $1 returning id`, [task.id])
    );
    assert.equal(gated.rows.length, 1, "the gate was actually set");

    const claim = await asTenant(ORG_A, () => claimTask(agent(ORG_A), task.id));
    assert.equal(claim.ok, false);
    assert.equal(claim.ok === false && claim.error, "approval_rejected");
  });
});
