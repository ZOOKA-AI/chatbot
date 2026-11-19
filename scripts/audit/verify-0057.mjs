#!/usr/bin/env node
/**
 * Verifies 0057_runtime_coverage_gaps against a real PostgreSQL engine (PGlite)
 * instead of reasoning about the SQL.
 *
 * The fixture reproduces the three states the migration must tell apart:
 *   1. a tenant-owned table added after 0051: no RLS, no grant  (the gap)
 *   2. a platform-owned table with no tenant column             (skip list)
 *   3. a table already migrated: RLS on, policy present, granted (no change)
 *
 * Then: up -> up (idempotency) -> down -> up, asserting after each step.
 * Nothing here touches production: PGlite is an in-process engine, in memory.
 *
 * Usage: node scripts/audit/verify-0057.mjs
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

const db = new PGlite();
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : ` -> got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`)
  );
}

async function one(sql) {
  const result = await db.query(sql);
  return result.rows[0];
}

async function state(table) {
  return one(`SELECT c.relrowsecurity AS rls,
       (SELECT count(*)::int FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies,
       has_table_privilege('zooka_runtime', c.oid, 'SELECT') AS can_select,
       has_table_privilege('zooka_runtime', c.oid, 'INSERT') AS can_insert
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='${table}'`);
}

await db.exec(`
  CREATE ROLE zooka_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  CREATE TABLE "ReferralReward" (
    id serial PRIMARY KEY,
    "organizationId" uuid NOT NULL,
    points integer NOT NULL DEFAULT 0
  );
  CREATE TABLE "WebhookEvent" (id serial PRIMARY KEY, payload text);
  CREATE TABLE "Chat" (id serial PRIMARY KEY, "organizationId" uuid NOT NULL);
  ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_coverage ON "Chat" FOR ALL
    USING (("organizationId")::text = current_setting('app.organization_id', true))
    WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Chat" TO zooka_runtime;
`);

console.log("--- before ---");
check("ReferralReward ungated", await state("ReferralReward"), {
  rls: false, policies: 0, can_select: false, can_insert: false,
});
check("WebhookEvent ungated", await state("WebhookEvent"), {
  rls: false, policies: 0, can_select: false, can_insert: false,
});

await db.exec(UP);

console.log("--- after first up ---");
check("ReferralReward gated + granted", await state("ReferralReward"), {
  rls: true, policies: 1, can_select: true, can_insert: true,
});
check("WebhookEvent left closed (skip list)", await state("WebhookEvent"), {
  rls: false, policies: 0, can_select: false, can_insert: false,
});
check("Chat untouched, no duplicate policy", await state("Chat"), {
  rls: true, policies: 1, can_select: true, can_insert: true,
});

// The tenant policy must isolate for real: org A cannot see org B's row.
await db.exec(`
  INSERT INTO "ReferralReward" ("organizationId", points)
  VALUES ('11111111-1111-4111-8111-111111111111', 10),
         ('22222222-2222-4222-8222-222222222222', 20);
  SET ROLE zooka_runtime;
  SET app.organization_id = '11111111-1111-4111-8111-111111111111';
`);
check("runtime sees only its own tenant", await one(`SELECT count(*)::int AS n FROM "ReferralReward"`), { n: 1 });
await db.exec(`RESET ROLE;`);

await db.exec(UP);
console.log("--- after second up (idempotent) ---");
check("ReferralReward still one policy", (await state("ReferralReward")).policies, 1);

await db.exec(DOWN);
console.log("--- after down ---");
check("tenant_coverage removed, RLS off, grant kept", await state("ReferralReward"), {
  rls: false, policies: 0, can_select: true, can_insert: true,
});
check("Chat policy preserved (pre-existing)", (await state("Chat")).policies, 1);

await db.exec(UP);
console.log("--- after re-up ---");
check("ReferralReward re-gated", (await state("ReferralReward")).policies, 1);

await db.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
