import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, test } from "vitest";

/**
 * Migration safety for the Commander schema, run on a real PostgreSQL engine.
 *
 * 0027 created the five tables without an organisation column; 0028 adds it.
 * This file drives the pair through the sequence the owner asked for
 * (UP -> VERIFY -> DOWN -> VERIFY -> UP) and checks the things a migration can
 * silently get wrong: order, foreign keys, indexes, referential integrity,
 * rollback completeness, and what happens to rows that already existed.
 *
 * Nothing here touches a real database: PGlite is an in-process PostgreSQL.
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

const SCOPED = ["AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"];

async function orgColumns() {
  const result = await pg.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema='public' and column_name='organizationId'`
  );
  return result.rows.map((row) => row.table_name).sort();
}

async function orgIndexes() {
  const result = await pg.query<{ indexname: string }>(
    `select indexname from pg_indexes
     where schemaname='public' and indexname like '%organizationId%'
     order by indexname`
  );
  return result.rows.map((row) => row.indexname);
}

async function foreignKeys() {
  const result = await pg.query<{ conname: string; confdeltype: string }>(
    `select conname, confdeltype from pg_constraint
     where contype='f' and conrelid::regclass::text in ('"AgentTask"','"AgentApproval"','"AgentDecision"','"AgentDeployment"')
     order by conname`
  );
  return result.rows;
}

beforeAll(async () => {
  pg = new PGlite();
});

afterAll(async () => {
  await pg?.close();
});

test("UP: 0027 then 0028 leaves every table scoped, indexed and referenced", async () => {
  await apply(migration("0027_agent_command_center.sql"));
  // Order matters: 0028 assumes 0027 ran first. Applying it to a bare schema
  // must fail rather than create a half-scoped database.
  const bare = new PGlite();
  await assert.rejects(
    (async () => {
      for (const part of migration("pending/0028_agent_tenant_scope.sql").split("--> statement-breakpoint")) {
        if (part.trim()) await bare.exec(part.trim());
      }
    })(),
    /AgentIdentity/,
    "0028 must not run before 0027"
  );
  await bare.close();

  await apply(migration("pending/0028_agent_tenant_scope.sql"));

  assert.deepEqual(await orgColumns(), [...SCOPED].sort());
  const indexes = await orgIndexes();
  for (const table of SCOPED) {
    assert.ok(indexes.includes(`${table}_organizationId_idx`), `${table} has no organisation index`);
  }

  const keys = await foreignKeys();
  assert.ok(keys.some((key) => key.conname.includes("ownerAgentId")), "task -> agent link kept");
  assert.ok(keys.some((key) => key.conname.includes("taskId")), "approval -> task link kept");

  // Idempotent: a second run is a no-op, not an error.
  await apply(migration("pending/0028_agent_tenant_scope.sql"));
  assert.equal((await orgColumns()).length, 5);
});

test("rows that existed before the migration are quarantined, never guessed", async () => {
  const legacy = new PGlite();
  await applyOn(legacy, migration("0027_agent_command_center.sql"));
  await legacy.exec(
    `insert into "AgentIdentity" (slug, "displayName", role, "keyHash")
     values ('legacy-agent', 'Legacy', 'worker', 'hash-legacy')`
  );
  await legacy.exec(
    `insert into "AgentTask" (title, instruction) values ('legacy task', 'do it')`
  );

  await applyOn(legacy, migration("pending/0028_agent_tenant_scope.sql"));
  const { rows } = await legacy.query<{ organizationId: string; count: number }>(
    `select "organizationId", count(*)::int as count from "AgentIdentity" group by 1`
  );
  assert.deepEqual(rows, [{ organizationId: "unclaimed", count: 1 }]);

  // The quarantined value is not a real workspace, so no tenant query matches it.
  const visible = await legacy.query(
    `select id from "AgentTask" where "organizationId" = $1`,
    ["unclaimed"]
  );
  assert.equal(visible.rows.length, 1, "quarantined rows stay findable for the operator");
  const visibleToRealTenant = await legacy.query(
    `select id from "AgentTask" where "organizationId" = $1`,
    ["org-alpha"]
  );
  assert.equal(visibleToRealTenant.rows.length, 0);

  await legacy.close();
});

async function applyOn(target: PGlite, sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await target.exec(statement);
  }
}

test("DOWN: only the new column and its indexes go, data and keys stay", async () => {
  await pg.exec(`insert into "AgentIdentity" (slug, "displayName", role, "keyHash", "organizationId")
                 values ('keep-me', 'Keeper', 'worker', 'hash-1', 'org-alpha')`);
  const before = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentIdentity"`);

  await apply(migration("pending/0028_agent_tenant_scope.down.sql"));

  assert.deepEqual(await orgColumns(), []);
  assert.deepEqual(await orgIndexes(), []);
  const after = await pg.query<{ count: number }>(`select count(*)::int as count from "AgentIdentity"`);
  assert.equal(after.rows[0].count, before.rows[0].count, "rollback keeps the rows");
  const keys = await foreignKeys();
  assert.ok(keys.length >= 2, "foreign keys survive the rollback");
});

test("UP again: the schema returns to the same shape", async () => {
  await apply(migration("pending/0028_agent_tenant_scope.sql"));
  assert.deepEqual(await orgColumns(), [...SCOPED].sort());
  const keys = await foreignKeys();
  assert.ok(keys.some((key) => key.conname.includes("ownerAgentId")));
});

test("referential integrity: deleting an agent orphans its task, never deletes it", async () => {
  await pg.exec(`delete from "AgentApproval"`);
  await pg.exec(`delete from "AgentTask"`);
  await pg.exec(`delete from "AgentIdentity"`);
  await pg.exec(`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                 values ('11111111-1111-4111-8111-111111111111','fk-agent','FK','worker','h','org-alpha')`);
  await pg.exec(`insert into "AgentTask" (id, title, instruction, "ownerAgentId", "organizationId")
                 values ('22222222-2222-4222-8222-222222222222','fk task','x','11111111-1111-4111-8111-111111111111','org-alpha')`);
  await pg.exec(`insert into "AgentApproval" (id, "taskId", reason, "organizationId")
                 values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','why','org-alpha')`);

  await pg.exec(`delete from "AgentIdentity" where id='11111111-1111-4111-8111-111111111111'`);
  const task = await pg.query<{ ownerAgentId: string | null }>(
    `select "ownerAgentId" from "AgentTask" where id='22222222-2222-4222-8222-222222222222'`
  );
  assert.equal(task.rows[0].ownerAgentId, null, "the task survives with no owner");

  await pg.exec(`delete from "AgentTask" where id='22222222-2222-4222-8222-222222222222'`);
  const approvals = await pg.query(`select id from "AgentApproval"`);
  assert.equal(approvals.rows.length, 0, "approvals cascade with their task");
});
