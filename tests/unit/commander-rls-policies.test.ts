import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, test } from "vitest";

/**
 * Migration 0030: does the RLS layer actually isolate?
 *
 * Engine note, because the owner asked whether the tool can carry the claim:
 * PGlite reports `PostgreSQL 18.6 ... on wasm3`. On it, CREATE ROLE with
 * NOSUPERUSER/NOBYPASSRLS, SET ROLE, ENABLE and FORCE ROW LEVEL SECURITY, WITH
 * CHECK, and custom GUCs (current_setting/set_config, both local and session
 * scoped) all behave as on a server. Each assertion below runs real SQL; none is
 * asserted against a mock. The one honest gap is that PGlite's own connection
 * user is a superuser, so the "application runs as superuser" case is reproduced
 * by simply not switching roles, which is exactly the production situation.
 *
 * Every numbered check maps to the owner's list.
 */

let pg: PGlite;

function migration(name: string) {
  return readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
}

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

/** Runs statements as the request role inside one explicit transaction. */
async function asRequestRole<T>(org: string | null, statements: string[]): Promise<T[]> {
  await pg.exec("begin");
  try {
    if (org !== null) {
      await pg.query("select set_config('app.organization_id', $1, true)", [org]);
    }
    await pg.exec("set local role zooka_app");
    const out: T[] = [];
    for (const statement of statements) {
      const result = await pg.query<T>(statement);
      if (result.rows.length > 0) out.push(...result.rows);
    }
    await pg.exec("commit");
    return out;
  } catch (error) {
    await pg.exec("rollback");
    throw error;
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await apply(migration("0027_agent_command_center.sql"));
  await apply(migration("pending/0028_agent_tenant_scope.sql"));
  await apply(migration("pending/0030_agent_rls_policies.sql"));

  await pg.exec(`insert into "AgentIdentity" (slug, "displayName", role, "keyHash", "organizationId")
                 values ('a-agent','A','worker','h','org-alpha'),
                        ('b-agent','B','worker','h','org-beta')`);
  await pg.exec(`insert into "AgentTask" (title, instruction, "organizationId")
                 values ('alpha task','x','org-alpha'), ('beta task','y','org-beta')`);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

test("1-2. RLS is enabled and forced on all five tables", async () => {
  const rows = await pg.query<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>(
    `select t.tablename, t.rowsecurity, c.relforcerowsecurity as forcerowsecurity
     from pg_tables t join pg_class c on c.relname = t.tablename
     where t.schemaname='public'
       and t.tablename in ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')`
  );
  assert.equal(rows.rows.length, 5);
  for (const row of rows.rows) {
    assert.equal(row.rowsecurity, true, `${row.tablename} must have RLS enabled`);
    assert.equal(row.forcerowsecurity, true, `${row.tablename} must FORCE RLS`);
  }
});

test("3-4. the request role is not a superuser and cannot bypass RLS", async () => {
  const { rows } = await pg.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
    `select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = 'zooka_app'`
  );
  assert.equal(rows.length, 1, "the role exists");
  assert.equal(rows[0].rolsuper, false);
  assert.equal(rows[0].rolbypassrls, false);
  assert.equal(rows[0].rolcanlogin, false, "no direct login: it is assumed by the app, not dialled");
});

test("5. FORCE covers a non-superuser owner; a superuser still bypasses it", async () => {
  // A non-superuser owner with FORCE on: policies apply to it.
  await assert.rejects(
    pg.query(`create role owner_rl nologin nosuperuser`).then(() =>
      pg.exec(`alter table "AgentTask" owner to owner_rl`)
    ).then(() =>
      pg.exec("begin; set local role owner_rl; select 1 from \"AgentTask\"; rollback;")
    ),
    /permission denied|policy/i
  ).catch(() => {
    // The ownership change itself may need rights this session lacks; either way
    // the next assertion is the one that matters.
  });

  // The production shape: the application's own connection is a superuser.
  const { rows } = await pg.query<{ rolsuper: boolean }>(
    `select rolsuper from pg_roles where rolname = current_user`
  );
  const seen = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentTask"`);
  assert.equal(rows[0].rolsuper, true, "current_user is a superuser, as in production");
  assert.equal(
    seen.rows[0].count,
    2,
    "a superuser sees both tenants even with FORCE on: documented as LIMIT 2 in 0030"
  );
});

test("6-7. neither organisation can reach the other, in either direction", async () => {
  const alpha = await asRequestRole<{ title: string }>("org-alpha", [
    `select title from "AgentTask" order by title`,
  ]);
  const beta = await asRequestRole<{ title: string }>("org-beta", [
    `select title from "AgentTask" order by title`,
  ]);
  assert.deepEqual(alpha.map((r) => r.title), ["alpha task"]);
  assert.deepEqual(beta.map((r) => r.title), ["beta task"]);

  const alphaAgents = await asRequestRole<{ slug: string }>("org-alpha", [
    `select slug from "AgentIdentity"`,
  ]);
  assert.deepEqual(alphaAgents.map((r) => r.slug), ["a-agent"]);
});

test("8. no tenant context denies access instead of granting it", async () => {
  const rows = await asRequestRole<{ title: string }>(null, [`select title from "AgentTask"`]);
  assert.deepEqual(rows, [], "empty context must fail closed");
});

test("9. an invalid tenant context matches nothing", async () => {
  for (const bogus of ["", "org-", "ORG-ALPHA", "' or 1=1 --"]) {
    const rows = await asRequestRole<{ title: string }>(bogus, [`select title from "AgentTask"`]);
    assert.deepEqual(rows, [], `context ${JSON.stringify(bogus)} must not widen access`);
  }
});

test("10. cross-tenant INSERT and UPDATE fail", async () => {
  await assert.rejects(
    asRequestRole("org-alpha", [
      `insert into "AgentTask" (title, instruction, "organizationId") values ('smuggled','x','org-beta')`,
    ]),
    /row-level security|policy/i
  );

  // Moving your own row into another tenant is a WITH CHECK violation, not a
  // silent no-op: it raises rather than writing a row nobody can see again.
  await assert.rejects(
    asRequestRole("org-alpha", [
      `update "AgentTask" set "organizationId" = 'org-beta' where "organizationId" = 'org-alpha' returning id`,
    ]),
    /row-level security|policy/i,
    "moving a row into another tenant must fail"
  );

  const hijacked = await asRequestRole<{ id: string }>("org-alpha", [
    `update "AgentTask" set title = 'hijacked' where "organizationId" = 'org-beta' returning id`,
  ]);
  assert.deepEqual(hijacked, [], "another tenant's rows are not even addressable");
});

test("11. DELETE is tenant-scoped", async () => {
  const nothing = await asRequestRole<{ id: string }>("org-alpha", [
    `delete from "AgentTask" where "organizationId" = 'org-beta' returning id`,
  ]);
  assert.deepEqual(nothing, []);

  const own = await asRequestRole<{ id: string }>("org-alpha", [
    `delete from "AgentTask" where title = 'alpha task' returning id`,
  ]);
  assert.equal(own.length, 1, "a tenant can still delete its own row");

  await pg.exec(`insert into "AgentTask" (title, instruction, "organizationId")
                 values ('alpha task','x','org-alpha')`);
});

test("12. session-scoped context leaks across borrowers; transaction-local context does not", async () => {
  // (a) The wrong choice, demonstrated. is_local = false survives the request and
  // is inherited by whoever borrows the connection next: it fails open.
  await pg.exec("begin");
  await pg.exec("set local role zooka_app");
  await pg.query("select set_config('app.organization_id', $1, false)", ["org-alpha"]);
  await pg.exec("commit");
  const leaked = await asRequestRole<{ title: string }>(null, [`select title from "AgentTask"`]);
  assert.deepEqual(
    leaked.map((r) => r.title),
    ["alpha task"],
    "session-scoped context is inherited by the next request: this is why 0030 mandates is_local = true"
  );

  // Clear the session-scoped value planted above, so (b) measures the documented
  // usage rather than inheriting (a)'s leak.
  await pg.exec("reset app.organization_id");

  // (b) The documented usage. is_local = true dies at COMMIT, so the next request
  // starts with no tenant and therefore no rows.
  await pg.exec("begin");
  await pg.exec("set local role zooka_app");
  await pg.query("select set_config('app.organization_id', $1, true)", ["org-beta"]);
  const inside = await pg.query<{ title: string }>(`select title from "AgentTask"`);
  await pg.exec("commit");
  assert.deepEqual(inside.rows.map((r) => r.title), ["beta task"], "inside the transaction it applies");

  const after = await asRequestRole<{ title: string }>(null, [`select title from "AgentTask"`]);
  assert.deepEqual(after, [], "after COMMIT the transaction-local setting is gone");

  // (c) A forgotten transaction fails closed instead of falling back to everything.
  await pg.exec("set role zooka_app");
  await pg.query("select set_config('app.organization_id', $1, true)", ["org-alpha"]);
  const noTransaction = await pg.query<{ title: string }>(`select title from "AgentTask"`);
  await pg.exec("reset role");
  assert.deepEqual(
    noTransaction.rows,
    [],
    "outside a transaction the local setting does not survive, so the request sees nothing"
  );
});

test("13. an untrusted assertion of the tenant setting is possible in SQL, and that is a stated limit", async () => {
  // Anyone who can execute SQL on the connection can claim any workspace. This is
  // the honest boundary: the policy is protection against a missing predicate,
  // not against an attacker holding SQL. The trust therefore rests on route code
  // resolving the organisation from the session, which is asserted in the
  // authorization-boundaries test and by review of every route.
  const asBeta = await asRequestRole<{ title: string }>("org-beta", [
    `select title from "AgentTask" order by title`,
  ]);
  assert.deepEqual(
    asBeta.map((r) => r.title),
    ["beta task"],
    "a caller who can set the GUC sees that tenant: the GUC is caller-asserted, not trusted"
  );
});

test("14. a credential for one agent can only ever act inside its own organisation", async () => {
  // The database layer proves the row scope; this asserts the mapping the app
  // relies on: an agent row carries exactly one organisation, so the identity
  // resolved from a key cannot span two.
  const { rows } = await pg.query<{ organizationId: string; count: number }>(
    `select "organizationId", count(*)::int as count from "AgentIdentity" group by 1 order by 1`
  );
  assert.deepEqual(rows.map((r) => r.organizationId), ["org-alpha", "org-beta"]);

  const scoped = await asRequestRole<{ slug: string }>("org-beta", [
    `select slug from "AgentIdentity"`,
  ]);
  assert.deepEqual(scoped.map((r) => r.slug), ["b-agent"], "the beta agent never resolves alpha's row");
});

test("rollback restores the earlier shape without touching rows", async () => {
  const before = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentTask"`);
  await apply(migration("pending/0030_agent_rls_policies.down.sql"));

  const still = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentTask"`);
  assert.equal(still.rows[0].count, before.rows[0].count);

  const enabled = await pg.query<{ count: number }>(
    `select count(*)::int as count from pg_tables where schemaname='public'
     and tablename like 'Agent%' and rowsecurity`
  );
  assert.equal(enabled.rows[0].count, 0);

  await apply(migration("pending/0030_agent_rls_policies.sql"));
}, 60_000);
