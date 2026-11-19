import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

/**
 * Rollback proof for migration 0027. The forward migration is applied to a
 * database that already looks like today's production (existing tables with
 * rows), then the down migration runs, and we assert the database is exactly back
 * to its previous shape: the five new tables gone, every pre-existing table and
 * row untouched, and re-applying forward works again.
 */
const MIGRATIONS = join(process.cwd(), "lib/db/migrations");
const UP = readFileSync(join(MIGRATIONS, "0027_agent_command_center.sql"), "utf8");
const DOWN = readFileSync(join(MIGRATIONS, "rollback", "0027_agent_command_center_down.sql"), "utf8");

const NEW_TABLES = [
  "AgentIdentity",
  "AgentTask",
  "AgentDecision",
  "AgentApproval",
  "AgentDeployment",
];

async function run(db: PGlite, script: string) {
  for (const part of script.split("--> statement-breakpoint")) {
    const sql = part.trim();
    if (sql) await db.exec(sql);
  }
}

async function tableNames(db: PGlite) {
  const result = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`
  );
  return result.rows.map((row) => row.table_name);
}

/** The shape production has before 0027: a couple of real tables with rows. */
async function baseline(db: PGlite) {
  await db.exec(`
    create table "User" (
      id text primary key,
      email text not null,
      password text
    );
    create table "Organization" (id text primary key, name text not null);
    insert into "User" (id, email, password) values
      ('u1', 'owner@example.test', 'hash1'),
      ('u2', 'second@example.test', 'hash2');
    insert into "Organization" (id, name) values ('o1', 'ZOOKA-AI');
  `);
}

test("0027 applies, rolls back cleanly, and re-applies", async () => {
  const db = new PGlite();
  await baseline(db);
  const before = await tableNames(db);

  await run(db, UP);
  const afterUp = await tableNames(db);
  for (const table of NEW_TABLES) {
    assert.ok(afterUp.includes(table), `${table} must exist after the migration`);
  }

  await run(db, DOWN);
  const afterDown = await tableNames(db);
  for (const table of NEW_TABLES) {
    assert.ok(!afterDown.includes(table), `${table} must be gone after the rollback`);
  }
  assert.deepEqual(
    [...afterDown].sort(),
    [...before].sort(),
    "the rollback must restore exactly the previous table set"
  );

  // Existing data survives the whole cycle, unchanged.
  const users = await db.query<{ id: string; email: string; password: string }>(
    `select id, email, password from "User" order by id`
  );
  assert.deepEqual(users.rows, [
    { id: "u1", email: "owner@example.test", password: "hash1" },
    { id: "u2", email: "second@example.test", password: "hash2" },
  ]);
  const orgs = await db.query<{ n: number }>(`select count(*)::int as n from "Organization"`);
  assert.equal(orgs.rows[0].n, 1);

  // Forward again: the rollback left nothing that blocks a second attempt.
  await run(db, UP);
  const reApplied = await tableNames(db);
  for (const table of NEW_TABLES) {
    assert.ok(reApplied.includes(table), `${table} must be re-creatable after rollback`);
  }
  await db.close();
});

test("the rollback is idempotent and harmless on a database that never had 0027", async () => {
  const db = new PGlite();
  await baseline(db);
  await run(db, DOWN);
  const tables = await tableNames(db);
  assert.ok(!tables.includes("AgentTask"));
  assert.ok(tables.includes("User"), "an unrelated table must never be dropped");
  await db.close();
});
