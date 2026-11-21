import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";
import { PLATFORM_OWNER_BOOTSTRAP_DDL } from "@/lib/platform/bootstrap-owner-ddl";

/**
 * Migration 0066 hands the first platform role to a real person, so three claims
 * are checked rather than assumed: the code copy is the reviewed file, the
 * statement is safe to run repeatedly, and it is a bootstrap that cannot undo a
 * deliberate revoke once an administrator exists.
 */

const OWNER = "aad414a8-46a5-4d40-b83c-c569daca8b7c";
const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0066_bootstrap_platform_owner.sql"),
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
  assert.equal(normalise(PLATFORM_OWNER_BOOTSTRAP_DDL.join(" ")), normalise(SQL));
});

test("the admin migrate route applies 0066 after 0063", () => {
  assert.ok(
    ROUTE.includes("bootstrap_platform_owner_0066"),
    "0066 is missing from the registry, so the owner can never be granted a role"
  );
  assert.ok(
    ROUTE.indexOf("platform_roles_0063") < ROUTE.indexOf("bootstrap_platform_owner_0066"),
    "0066 must run after 0063 creates the table it writes to"
  );
});

test("it grants the owner super_admin exactly once and is re-runnable", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "User" ("id" uuid PRIMARY KEY);`);
  await db.exec(`CREATE TABLE "PlatformRole" (
    "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "role" varchar NOT NULL,
    "grantedBy" varchar(128) NOT NULL,
    "reason" text NOT NULL,
    "grantedAt" timestamp DEFAULT now() NOT NULL
  );`);
  await db.exec(`INSERT INTO "User" ("id") VALUES ('${OWNER}');`);

  for (const statement of PLATFORM_OWNER_BOOTSTRAP_DDL) await db.exec(statement);
  for (const statement of PLATFORM_OWNER_BOOTSTRAP_DDL) await db.exec(statement);

  const rows = await db.query<{ role: string; grantedBy: string }>(
    `SELECT "role", "grantedBy" FROM "PlatformRole"`
  );
  assert.equal(rows.rows.length, 1, "a second run must not duplicate the grant");
  assert.equal(rows.rows[0].role, "super_admin");
  assert.equal(rows.rows[0].grantedBy, "migration:0066");
});

test("a deliberate revoke is not undone while an administrator remains", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "User" ("id" uuid PRIMARY KEY);`);
  await db.exec(`CREATE TABLE "PlatformRole" (
    "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "role" varchar NOT NULL,
    "grantedBy" varchar(128) NOT NULL,
    "reason" text NOT NULL,
    "grantedAt" timestamp DEFAULT now() NOT NULL
  );`);
  const other = "11111111-1111-4111-8111-111111111111";
  await db.exec(`INSERT INTO "User" ("id") VALUES ('${OWNER}'), ('${other}');`);
  await db.exec(
    `INSERT INTO "PlatformRole" ("userId","role","grantedBy","reason") VALUES ('${other}','super_admin','manual','another administrator')`
  );

  for (const statement of PLATFORM_OWNER_BOOTSTRAP_DDL) await db.exec(statement);

  const rows = await db.query<{ userId: string }>(`SELECT "userId" FROM "PlatformRole"`);
  assert.equal(rows.rows.length, 1, "an existing super_admin must keep the bootstrap silent");
  assert.equal(rows.rows[0].userId, other);
});

test("it is silent on a database where the account does not exist yet", async () => {
  // CI applies every pending file to a fresh Postgres. There the owner's row is
  // absent, and an unguarded insert would violate the foreign key and fail the
  // migration step rather than skipping quietly.
  const db = new PGlite();
  await db.exec(`CREATE TABLE "User" ("id" uuid PRIMARY KEY);`);
  await db.exec(`CREATE TABLE "PlatformRole" (
    "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "role" varchar NOT NULL,
    "grantedBy" varchar(128) NOT NULL,
    "reason" text NOT NULL,
    "grantedAt" timestamp DEFAULT now() NOT NULL
  );`);

  for (const statement of PLATFORM_OWNER_BOOTSTRAP_DDL) await db.exec(statement);

  const rows = await db.query(`SELECT "userId" FROM "PlatformRole"`);
  assert.equal(rows.rows.length, 0, "an empty database must not receive a grant");
});
