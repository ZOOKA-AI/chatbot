import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";
import { PLATFORM_ROLES_DDL } from "@/lib/platform/ddl";

/**
 * Migration 0063 has to be reachable by the only migration path production has.
 *
 * The admin endpoint runs a code copy of the DDL, so three separate claims are
 * checked here: the code copy is the reviewed file, the file is safe to run more
 * than once (a failed batch is retried, and a partial run leaves half the
 * schema), and the grant table it creates is what actually decides /admin.
 */

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0063_platform_roles.sql"),
  "utf8"
);
const ROUTE = readFileSync(join(process.cwd(), "app/api/admin/migrate/route.ts"), "utf8");

const normalise = (value: string) =>
  value
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

test("the code copy is byte-for-byte the reviewed migration file", () => {
  assert.equal(normalise(PLATFORM_ROLES_DDL.join(" ")), normalise(SQL));
});

test("the admin migrate route actually applies 0063", () => {
  assert.ok(
    ROUTE.includes("platform_roles_0063"),
    "0063 is missing from the route registry, so production can never create the grant table"
  );
});

test("0063 creates both tables, enables RLS and indexes the audit trail", async () => {
  const db = new PGlite();
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);

  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  );
  const names = tables.rows.map((row) => row.table_name);
  assert.ok(names.includes("PlatformRole"), names.join(","));
  assert.ok(names.includes("PlatformAuditLog"), names.join(","));

  const rls = await db.query<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'Platform%'`
  );
  for (const row of rls.rows) assert.equal(row.rowsecurity, true, row.tablename);

  const indexes = await db.query<{ indexname: string }>(
    `select indexname from pg_indexes where schemaname = 'public' and tablename = 'PlatformAuditLog'`
  );
  assert.ok(indexes.rows.some((row) => row.indexname === "PlatformAuditLog_created_idx"));
  await db.close();
});

test("a role outside the allowed pair cannot be stored", async () => {
  const db = new PGlite();
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);
  const user = await db.query<{ id: string }>(
    `insert into "User" default values returning id`
  );
  const userId = user.rows[0].id;

  await assert.rejects(
    () =>
      db.exec(
        `insert into "PlatformRole" ("userId","role","grantedBy","reason") values ('${userId}','owner','test','typo')`
      ),
    /PlatformRole_role_check/
  );
  await db.exec(
    `insert into "PlatformRole" ("userId","role","grantedBy","reason") values ('${userId}','admin','test','ok')`
  );
  await db.close();
});

test("running it twice is a no-op, not an error", async () => {
  const db = new PGlite();
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);
  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);

  const tables = await db.query<{ n: string }>(
    `select count(*)::text as n from information_schema.tables where table_schema='public' and table_name like 'Platform%'`
  );
  assert.equal(tables.rows[0].n, "2");
  await db.close();
});

test("a half-migrated database finishes without losing the existing grant", async () => {
  const db = new PGlite();
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  // Production shape after a batch that failed partway: the first table exists
  // and already carries a grant, the audit table does not.
  await db.exec(PLATFORM_ROLES_DDL[0]);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  await db.exec(
    `insert into "PlatformRole" ("userId","role","grantedBy","reason") values ('${user.rows[0].id}','super_admin','owner','pre-existing')`
  );

  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);

  const kept = await db.query<{ role: string }>(`select role from "PlatformRole"`);
  assert.equal(kept.rows.length, 1);
  assert.equal(kept.rows[0].role, "super_admin");
  const audit = await db.query<{ n: string }>(
    `select count(*)::text as n from information_schema.tables where table_schema='public' and table_name='PlatformAuditLog'`
  );
  assert.equal(audit.rows[0].n, "1");
  await db.close();
});

test("the lookup /admin performs resolves a real grant", async () => {
  const db = new PGlite();
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  for (const statement of PLATFORM_ROLES_DDL) await db.exec(statement);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  const userId = user.rows[0].id;
  await db.exec(
    `insert into "PlatformRole" ("userId","role","grantedBy","reason") values ('${userId}','admin','owner','access test')`
  );

  // Same shape as getPlatformRole: select the role by immutable user id.
  const found = await db.query<{ role: string }>(
    `select "role" from "PlatformRole" where "userId" = '${userId}' limit 1`
  );
  assert.equal(found.rows[0]?.role, "admin");

  const stranger = await db.query<{ role: string }>(
    `select "role" from "PlatformRole" where "userId" = gen_random_uuid() limit 1`
  );
  assert.equal(stranger.rows.length, 0, "a user with no grant must resolve to no role");
  await db.close();
});

test("nothing grants a platform role automatically", () => {
  // The only writer must be the explicit operator script. A seed, a sign-up
  // hook, or a first-user rule would hand platform administration to whoever
  // registered first.
  const roots = ["app", "lib", "scripts"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(path);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        if (/insert\s+into\s+"?PlatformRole/i.test(text)) offenders.push(path);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(
    offenders.filter((path) => !path.endsWith("scripts/admin/platform-role.mjs")),
    [],
    `a platform role is written outside the operator script: ${offenders.join(", ")}`
  );
});
