import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * Tenant isolation on a real PostgreSQL server, over real connections.
 *
 * Why this file exists next to the PGlite ones: PGlite is a single backend, so it
 * cannot prove that two requests on two connections are isolated, nor that a
 * pooled connection does not carry a tenant into the next request. This runs
 * against a server on a socket, with the application's own login role and its own
 * password, and no access to any production database.
 *
 * Skipped unless both URLs are provided, because a credential belongs in the
 * environment, never in the repository:
 *   ZOOKA_TEST_PG_ADMIN    superuser/owner URL, used only to apply migrations
 *   ZOOKA_TEST_PG_RUNTIME  zooka_runtime URL, the role the application will use
 */

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const MIGRATIONS = [
  "0027_agent_command_center.sql",
  "pending/0028_agent_tenant_scope.sql",
  "pending/0030_agent_rls_policies.sql",
  "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0040_agent_tools_and_instructions.sql",
      "pending/0041_workspace_projects.sql",
];

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
/** A second pool that never shares a connection with `runtime`. */
let second: ReturnType<typeof postgres>;

async function applyMigrations() {
  for (const name of MIGRATIONS) {
    const body = readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
    for (const part of body.split("--> statement-breakpoint")) {
      const statement = part.trim();
      if (!statement) continue;
      try {
        await admin.unsafe(statement);
      } catch (error) {
        // Idempotency: re-applying a migration on an existing database is expected
        // to complain about objects that already exist. Anything else is a real
        // failure and must surface.
        const message = (error as Error).message;
        if (!/already exists|does not exist/i.test(message)) throw error;
      }
    }
  }
}

async function seed() {
  await admin`delete from "AgentTask"`;
  await admin`delete from "AgentApproval"`;
  await admin`delete from "AgentIdentity"`;
  await admin`insert into "AgentIdentity" (slug, "displayName", role, "keyHash", "organizationId")
              values ('a-agent','A','worker','ha',${ORG_A}), ('b-agent','B','worker','hb',${ORG_B})`;
  await admin`insert into "AgentTask" (title, instruction, "organizationId")
              values ('a task','x',${ORG_A}), ('b task','y',${ORG_B})`;
}

describe.skipIf(!ready)("real PostgreSQL: tenant isolation over independent connections", () => {
  beforeAll(async () => {
    admin = postgres(ADMIN as string, { max: 1 });
    // Vitest runs files in parallel and these suites share one database, so they
    // take turns instead of truncating each other's fixtures mid-run.
    await admin.unsafe("select pg_advisory_lock(727272)");
    runtime = postgres(RUNTIME as string, { max: 1 });
    second = postgres(RUNTIME as string, { max: 1 });
    await applyMigrations();
    await seed();
  }, 60_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await Promise.all([admin?.end(), runtime?.end(), second?.end()]);
  });

  test("the runtime role is a real login with no privilege escape", async () => {
    const [who] = await runtime`select current_user as role`;
    assert.equal(who.role, "zooka_runtime");

    const [attrs] = await runtime`select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
                                  from pg_roles where rolname = current_user`;
    assert.equal(attrs.rolsuper, false);
    assert.equal(attrs.rolbypassrls, false);
    assert.equal(attrs.rolcreatedb, false);
    assert.equal(attrs.rolcreaterole, false);

    // Owns nothing and cannot create in public: DDL and DISABLE RLS are out of reach.
    const owned = await runtime`select count(*)::int as n from pg_class c
      join pg_roles r on r.oid = c.relowner where r.rolname = current_user`;
    assert.equal(owned[0].n, 0);

    const [create] = await runtime`select has_schema_privilege(current_user,'public','CREATE') as ok`;
    assert.equal(create.ok, false);

    await expect(runtime`alter table "AgentTask" disable row level security`).rejects.toThrow(
      /must be owner|permission denied/i
    );
  });

  test("RLS is enforced for the application role, not merely present", async () => {
    const bare = await runtime.begin(async (tx) => {
      return tx`select title from "AgentTask" order by title`;
    });
    assert.deepEqual([...bare].map((r) => r.title), [], "no context: nothing is visible");

    const alpha = await runtime.begin(async (tx) => {
      await tx`select set_config('app.organization_id', ${ORG_A}, true)`;
      return tx`select title from "AgentTask" order by title`;
    });
    assert.deepEqual(alpha.map((r) => r.title), ["a task"]);
  });

  test("two independent connections are isolated at the same time", async () => {
    // Both transactions are open simultaneously; neither can see the other's tenant.
    const run = (client: typeof runtime, org: string) =>
      client.begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${org}, true)`;
        // Hold the transaction open long enough for the other one to overlap.
        await tx`select pg_sleep(0.05)`;
        const rows = await tx`select title from "AgentTask" order by title`;
        const [ctx] = await tx`select current_setting('app.organization_id', true) as org`;
        return { titles: rows.map((r) => r.title), org: ctx.org };
      });

    const [a, b] = await Promise.all([run(runtime, ORG_A), run(second, ORG_B)]);
    assert.deepEqual(a.titles, ["a task"]);
    assert.deepEqual(b.titles, ["b task"]);
    assert.equal(a.org, ORG_A);
    assert.equal(b.org, ORG_B);
  }, 20_000);

  test("a reused pooled connection does not carry the previous tenant", async () => {
    // Same pool, max 1: the second transaction almost certainly lands on the
    // connection the first used.
    await runtime.begin(async (tx) => {
      await tx`select set_config('app.organization_id', ${ORG_A}, true)`;
      const rows = await tx`select title from "AgentTask"`;
      assert.equal(rows.length, 1, "the tenant applied inside its own transaction");
    });

    const after = await runtime.begin(async (tx) => {
      return tx`select title from "AgentTask"`;
    });
    assert.deepEqual([...after].map((r) => r.title), [], "the next request starts with no tenant");

    const [leak] = await runtime`select current_setting('app.organization_id', true) as org`;
    assert.ok(!leak.org, "nothing survives COMMIT");
  });

  test("a failed transaction rolls back and leaves no trace", async () => {
    await expect(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${ORG_A}, true)`;
        await tx`insert into "AgentTask" (title, instruction, "organizationId") values ('half written','x',${ORG_A})`;
        throw new Error("boom after the write");
      })
    ).rejects.toThrow(/boom/);

    const rows = await admin`select title from "AgentTask" where title = 'half written'`;
    assert.equal(rows.length, 0, "the insert was rolled back");
  });

  test("cross-tenant writes are refused by the server", async () => {
    await expect(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${ORG_A}, true)`;
        await tx`insert into "AgentTask" (title, instruction, "organizationId") values ('smuggled','x',${ORG_B})`;
      })
    ).rejects.toThrow(/row-level security|policy/i);

    // Moving a row out of the tenant is a WITH CHECK violation on real PostgreSQL:
    // it raises, it does not silently write an invisible row.
    await expect(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${ORG_A}, true)`;
        return tx`update "AgentTask" set "organizationId" = ${ORG_B} returning id`;
      })
    ).rejects.toThrow(/row-level security|policy/i);
  });

  test("an invalid tenant context matches nothing", async () => {
    for (const bogus of ["", "ORG-A", "not-a-uuid"]) {
      const rows = await runtime.begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${bogus}, true)`;
        return tx`select title from "AgentTask"`;
      });
      assert.deepEqual(
        [...rows].map((r) => r.title),
        [],
        `context ${JSON.stringify(bogus)} must not widen access`
      );
    }
  });

  test("a privileged connection bypasses RLS, which is why the role check exists", async () => {
    // Same database, same policies, privileged connection: everything is visible.
    const all = await admin`select title from "AgentTask" order by title`;
    expect(all.length).toBe(2);

    // Managed Postgres gives the owner BYPASSRLS without superuser, so the
    // property this test needs is "ignores policies", not "is superuser".
    const [privileged] = await admin`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    assert.ok(
      privileged.rolsuper || privileged.rolbypassrls,
      "the admin connection must ignore policies; that is why the runtime role check exists"
    );
  });
});
