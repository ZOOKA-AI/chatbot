import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";
import { TIKTOK_DDL } from "@/lib/integrations/tiktok/ddl";

/**
 * The TikTok migration, applied to a disposable in-process Postgres.
 *
 * Nothing here touches a shared or production database: PGlite is an empty
 * Postgres that exists for the length of one test. The point is to prove the
 * DDL actually runs, that row level security is on, that a second workspace
 * cannot read the first workspace's connection row, and that the down file
 * reverses the up file.
 *
 * The policy calls public.app_is_org_member(), which migration 0062 defines.
 * It is stubbed here against a membership table so the test exercises both
 * halves of the predicate: the organization must match AND the caller must be
 * a member of it.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create table "Organization" ("id" uuid primary key);
    create table "User" ("id" uuid primary key);
    create role zooka_runtime nologin;
    grant usage on schema public to zooka_runtime;
    create table public.org_member (org uuid primary key, member boolean not null);
    create function public.app_is_org_member(p text) returns boolean
      language sql stable as $fn$
        select coalesce((select m.member from public.org_member m where m.org::text = p), false)
      $fn$;
    grant select on public.org_member to zooka_runtime;
  `);
  return db;
}

async function apply(db: PGlite, statements: string[]) {
  for (const statement of statements) {
    await db.exec(statement);
  }
}

async function tableCount(db: PGlite): Promise<number> {
  const result = await db.query<{ count: number }>(
    `select count(*)::int as count from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('TikTokConnection','TikTokUpload')`
  );
  return result.rows[0]?.count ?? -1;
}

test("the migration applies, enables RLS and is idempotent", async () => {
  const db = await freshDb();
  await apply(db, TIKTOK_DDL);

  const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('TikTokConnection','TikTokUpload') order by relname`
  );
  assert.equal(tables.rows.length, 2);
  for (const row of tables.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS on`);
  }

  const policies = await db.query<{ tablename: string; qual: string }>(
    `select tablename, qual from pg_policies
     where schemaname = 'public' and policyname like '%_tenant' order by tablename`
  );
  assert.equal(policies.rows.length, 2, "one tenant policy per table");
  for (const row of policies.rows) {
    assert.match(row.qual, /organizationId/);
    assert.match(row.qual, /app\.organization_id/);
    assert.match(row.qual, /app_is_org_member/, "membership guard must be present");
  }

  const fks = await db.query<{ conname: string }>(
    `select conname from pg_constraint
     where contype = 'f' and confrelid = '"User"'::regclass`
  );
  assert.equal(fks.rows.length, 2, "both tables must reference User");

  // Running it again must be a no-op, not an error: the admin endpoint retries.
  await apply(db, TIKTOK_DDL);
  assert.equal(await tableCount(db), 2);
  await db.close();
});

test("one workspace cannot read another workspace's TikTok row", async () => {
  const db = await freshDb();
  await apply(db, TIKTOK_DDL);
  await db.exec(`
    insert into "Organization" ("id") values ('${ORG_A}'), ('${ORG_B}');
    insert into "User" ("id") values ('${USER_A}');
    insert into public.org_member (org, member) values ('${ORG_A}', true), ('${ORG_B}', false);
    insert into "TikTokConnection"
      ("organizationId","userId","openId","encryptedTokens")
    values ('${ORG_A}','${USER_A}','open-a','ciphertext-a'),
           ('${ORG_B}','${USER_A}','open-b','ciphertext-b');
  `);

  await db.exec(`set role zooka_runtime;`);

  // Workspace A, member: only A's row.
  await db.exec(`select set_config('app.organization_id','${ORG_A}',false);`);
  const seenA = await db.query<{ openId: string }>(
    `select "openId" from "TikTokConnection"`
  );
  assert.deepEqual(seenA.rows.map((row) => row.openId), ["open-a"]);

  // Workspace B matches on the column but the caller is not a member: zero rows.
  await db.exec(`select set_config('app.organization_id','${ORG_B}',false);`);
  const seenB = await db.query(`select "openId" from "TikTokConnection"`);
  assert.equal(seenB.rows.length, 0, "membership clause must deny");

  // No workspace selected at all: fail closed, zero rows.
  await db.exec(`select set_config('app.organization_id','',false);`);
  const none = await db.query(`select "openId" from "TikTokConnection"`);
  assert.equal(none.rows.length, 0);
  await db.exec(`reset role;`);
  await db.close();
});

test("the down file reverses the up file, and up runs again afterwards", async () => {
  const db = await freshDb();
  const down = readFileSync(
    join(
      process.cwd(),
      "lib/db/migrations/pending/0064_tiktok_integration.down.sql"
    ),
    "utf8"
  );
  await apply(db, TIKTOK_DDL);
  // The down file carries DO $$ guards, so it runs as one script.
  await db.exec(down);
  assert.equal(await tableCount(db), 0, "down must remove both tables");

  await apply(db, TIKTOK_DDL);
  assert.equal(await tableCount(db), 2, "up after down must recreate them");
  await db.close();
});

test("the rollback refuses to drop a table that still holds rows", async () => {
  const db = await freshDb();
  await apply(db, TIKTOK_DDL);
  await db.exec(`
    insert into "Organization" ("id") values ('${ORG_A}');
    insert into "User" ("id") values ('${USER_A}');
    insert into "TikTokConnection"
      ("organizationId","userId","openId","encryptedTokens")
    values ('${ORG_A}','${USER_A}','open-a','ciphertext-a');
  `);
  const down = readFileSync(
    join(
      process.cwd(),
      "lib/db/migrations/pending/0064_tiktok_integration.down.sql"
    ),
    "utf8"
  );
  await assert.rejects(() => db.exec(down), /forward_only/);
  assert.equal(await tableCount(db), 2, "nothing may be dropped");
  await db.close();
});
