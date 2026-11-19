#!/usr/bin/env node
/**
 * Verifies 0057_runtime_least_privilege_guard on a real PostgreSQL engine
 * (PGlite, in process, in memory) instead of reasoning about the SQL.
 *
 * Scenarios:
 *   1. clean fixture: guard passes, a stray grant on a service-only table is
 *      revoked, the granted tenant table keeps its access
 *   2. idempotency: running the up file twice changes nothing
 *   3. violation: a granted table with RLS off makes the guard raise, so a
 *      broken deployment stops instead of shipping a hole
 *   4. down file: no-op, no privilege restored
 *
 * Usage: node scripts/audit/verify-0057-guard.mjs
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const UP = readFileSync(
  new URL("../../lib/db/migrations/pending/0057_runtime_coverage_gaps.sql", import.meta.url),
  "utf8"
);
const DOWN = readFileSync(
  new URL("../../lib/db/migrations/pending/0057_runtime_coverage_gaps.down.sql", import.meta.url),
  "utf8"
);

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const FIXTURE = `
CREATE ROLE zooka_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT zooka_runtime TO current_user;
CREATE TABLE "Chat" (id uuid primary key, "organizationId" uuid);
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Chat" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Chat" TO zooka_runtime;
CREATE TABLE "PasswordResetToken" (id uuid primary key, "tokenHash" text);
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
-- the accidental grant this migration is meant to close
GRANT SELECT ON "PasswordResetToken" TO zooka_runtime;
`;

const guard = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    console.error(`scenario "${name}" threw:`, error.message);
    process.exit(1);
  }
};

async function fresh(fixture = FIXTURE) {
  const db = new PGlite();
  await db.exec(fixture);
  return db;
}

const canSelect = async (db, table) =>
  (await db.query(`select has_table_privilege('zooka_runtime', $1, 'SELECT') ok`, [table])).rows[0].ok;

// 1 + 2. clean fixture, then idempotency
await guard("clean", async () => {
  const db = await fresh();
  const before = await canSelect(db, '"PasswordResetToken"');
  await db.exec(UP);
  const afterClosed = await canSelect(db, '"PasswordResetToken"');
  const chatKept = await canSelect(db, '"Chat"');
  check("stray grant on a service-only table existed first", before === true, String(before));
  check("the guard revokes it", afterClosed === false, String(afterClosed));
  check("the tenant table keeps its access", chatKept === true, String(chatKept));

  await db.exec(UP);
  check("second run is a no-op", (await canSelect(db, '"Chat"')) === true);
  await db.exec(DOWN);
  check("down restores nothing", (await canSelect(db, '"PasswordResetToken"')) === false);
  await db.close();
});

// 3. a granted table with RLS off must fail the guard
{
  const db = await fresh(FIXTURE);
  await db.exec(`CREATE TABLE "Loose" (id uuid primary key, "organizationId" uuid);
GRANT SELECT ON "Loose" TO zooka_runtime;`);
  let raised = false;
  let message = "";
  try {
    await db.exec(UP);
  } catch (error) {
    raised = true;
    message = error.message;
  }
  check("guard refuses a granted table without RLS", raised, message.slice(0, 90));
  check("the failure names the table", /Loose/.test(message), message.slice(0, 60));
  await db.close();
}

// 4. a superuser or BYPASSRLS runtime role must fail the guard
{
  const db = await fresh(FIXTURE);
  await db.exec(`ALTER ROLE zooka_runtime BYPASSRLS;`);
  let raised = false;
  let message = "";
  try {
    await db.exec(UP);
  } catch (error) {
    raised = true;
    message = error.message;
  }
  check("guard refuses a BYPASSRLS runtime role", raised, message.slice(0, 80));
  await db.close();
}

// 5. missing role is a reported no-op, not a crash
{
  const db = new PGlite();
  let crashed = false;
  try {
    await db.exec(UP);
  } catch {
    crashed = true;
  }
  check("missing runtime role is a no-op", crashed === false);
  await db.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
