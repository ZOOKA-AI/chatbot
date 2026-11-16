import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, test } from "vitest";

/**
 * Migrations 0027 to 0030, in order, on a fresh engine each time.
 *
 * The owner asked for the things a migration chain gets wrong even when every
 * file "works": data that existed before, duplicate addresses blocking a unique
 * index, a run interrupted halfway, rollbacks that take more than they added,
 * and foreign keys/ indexes surviving all of it.
 *
 * Nothing here touches production, and no migration is applied anywhere else.
 */

const FILES = [
  "0027_agent_command_center.sql",
  "pending/0028_agent_tenant_scope.sql",
  "pending/0029_auth_email_verification.sql",
  "pending/0030_agent_rls_policies.sql",
];

const file = (name: string) => readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
const parts = (name: string) => file(name).split("--> statement-breakpoint").map((p) => p.trim()).filter(Boolean);

/** 0029 expects the auth tables the app already has; create the minimum. */
const AUTH_BASE = `
  create table if not exists "User" (
    id uuid primary key default gen_random_uuid(),
    email varchar(64) not null,
    password varchar(64)
  );
  create table if not exists "PasswordResetToken" (
    "tokenHash" varchar(64) primary key not null,
    "userId" uuid not null references "User"(id) on delete cascade,
    "expiresAt" timestamp not null,
    "usedAt" timestamp,
    "createdAt" timestamp default now() not null
  );
`;

let engines: PGlite[] = [];
async function engine() {
  const pg = new PGlite();
  engines.push(pg);
  await pg.exec(AUTH_BASE);
  return pg;
}

afterEach(async () => {
  await Promise.all(engines.map((pg) => pg.close()));
  engines = [];
});

async function run(pg: PGlite, name: string) {
  for (const part of parts(name)) await pg.exec(part);
}

describe("the whole chain", () => {
  test("0027 to 0030 apply in order on an empty database", async () => {
    const pg = await engine();
    for (const name of FILES) await run(pg, name);

    const tables = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema='public' and table_name in
       ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment','EmailVerificationToken')`
    );
    assert.equal(tables.rows[0].count, 6);

    const rls = await pg.query<{ count: number }>(
      `select count(*)::int as count from pg_tables
       where schemaname='public' and tablename like 'Agent%' and rowsecurity and tablename <> 'AgentMessage'`
    );
    assert.ok(Number(rls.rows[0].count) >= 5, "every Commander table ends up protected");

    const role = await pg.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      `select rolbypassrls, rolsuper from pg_roles where rolname='zooka_app'`
    );
    assert.equal(role.rows[0].rolbypassrls, false);
    assert.equal(role.rows[0].rolsuper, false);
  }, 90_000);

  test("out-of-order application is refused rather than half done", async () => {
    const pg = await engine();
    // 0028 without 0027 has nothing to alter.
    await assert.rejects(run(pg, "pending/0028_agent_tenant_scope.sql"), /AgentIdentity/);
  }, 60_000);

  test("legacy rows survive the chain and are quarantined, not guessed", async () => {
    const pg = await engine();
    await run(pg, FILES[0]);
    await pg.exec(`insert into "AgentIdentity" (slug, "displayName", role, "keyHash")
                   values ('legacy','Legacy','worker','h')`);
    await pg.exec(`insert into "AgentTask" (title, instruction) values ('legacy task','x')`);

    await run(pg, FILES[1]);
    const { rows } = await pg.query<{ organizationId: string }>(
      `select distinct "organizationId" from "AgentIdentity"`
    );
    assert.deepEqual(rows.map((r) => r.organizationId), ["unclaimed"]);
  }, 60_000);

  test("duplicate addresses stop 0029 before its index is attempted", async () => {
    const pg = await engine();
    await pg.exec(`insert into "User" (email) values ('a@b.co'), ('A@b.co')`);
    await assert.rejects(run(pg, "pending/0029_auth_email_verification.sql"), /duplicated/);

    // And the earlier migration is untouched: the failure did not leave a
    // half-built verification table behind.
    const table = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema='public' and table_name='EmailVerificationToken'`
    );
    assert.equal(table.rows[0].count, 0);
  }, 60_000);

  test("an interrupted 0028 can be resumed, and applying it twice is a no-op", async () => {
    const pg = await engine();
    await run(pg, FILES[0]);

    const statements = parts(FILES[1]);
    // Stop after the third column: a realistic partial failure.
    for (const statement of statements.slice(0, 3)) await pg.exec(statement);

    const partial = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.columns
       where table_schema='public' and column_name='organizationId'`
    );
    assert.equal(partial.rows[0].count, 3, "the run really did stop halfway");

    await run(pg, FILES[1]);
    await run(pg, FILES[1]);

    const complete = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.columns
       where table_schema='public' and column_name='organizationId'`
    );
    assert.equal(complete.rows[0].count, 5, "resumption completed the migration");
  }, 60_000);

  test("rollback order returns to the starting shape without losing rows", async () => {
    const pg = await engine();
    for (const name of FILES) await run(pg, name);
    await pg.exec(`insert into "AgentIdentity" (slug,"displayName",role,"keyHash","organizationId")
                   values ('keep','Keep','worker','h','org-alpha')`);
    await pg.exec(`insert into "User" (email) values ('keep@example.com')`);

    await run(pg, "pending/0030_agent_rls_policies.down.sql");
    await run(pg, "pending/0029_auth_email_verification.down.sql");
    await run(pg, "pending/0028_agent_tenant_scope.down.sql");

    const agents = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentIdentity"`);
    const users = await pg.query<{ count: number }>(`select count(*)::int as count from "User"`);
    assert.equal(agents.rows[0].count, 1, "the agent row survived every rollback");
    assert.equal(users.rows[0].count, 1, "the user row survived");

    const scoped = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.columns
       where table_schema='public' and column_name='organizationId'`
    );
    assert.equal(scoped.rows[0].count, 0);

    // And the chain can be applied again on the rolled-back database.
    for (const name of FILES) await run(pg, name);
    const again = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.columns
       where table_schema='public' and column_name='organizationId'`
    );
    assert.equal(again.rows[0].count, 5);
  }, 120_000);
});
