import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";
import {
  PLATFORM_ROLES_0063_DDL,
  TIKTOK_PUBLISH_JOBS_0065_DDL,
} from "@/lib/db/ddl/registry";
import { TIKTOK_DDL } from "@/lib/integrations/tiktok/ddl";
import { splitSql } from "../helpers/split-sql";

/**
 * The three release migrations, applied together, in the order production will
 * apply them, on a disposable in-process Postgres.
 *
 * Nothing here touches a shared or production database. The point is the failure
 * mode that only shows up when the three run as one release: 0065 depends on a
 * table 0064 creates, both must leave RLS on for the runtime-grant guard, and the
 * down files must reverse in the opposite order without leaving a table behind.
 */

const DOWN = (file: string) =>
  splitSql(readFileSync(join(process.cwd(), "lib/db/migrations/pending", file), "utf8"));

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
  for (const statement of statements) await db.exec(statement);
}

const SIX = [
  "PlatformAuditLog",
  "PlatformRole",
  "TikTokConnection",
  "TikTokPublishEvent",
  "TikTokPublishJob",
  "TikTokUpload",
];

async function state(db: PGlite) {
  const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity from pg_class
     where relnamespace = 'public'::regnamespace and relname = any($1::text[])
     order by relname`,
    [SIX]
  );
  return result.rows;
}

test("0063 then 0064 then 0065 apply as one release, all with RLS on", async () => {
  const db = await freshDb();
  await apply(db, PLATFORM_ROLES_0063_DDL);
  await apply(db, TIKTOK_DDL);
  await apply(db, TIKTOK_PUBLISH_JOBS_0065_DDL);

  const rows = await state(db);
  assert.deepEqual(rows.map((row) => row.relname), SIX);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS on`);
  }
});

test("applying the release twice is safe", async () => {
  const db = await freshDb();
  for (const statements of [PLATFORM_ROLES_0063_DDL, TIKTOK_DDL, TIKTOK_PUBLISH_JOBS_0065_DDL]) {
    await apply(db, statements);
    await apply(db, statements);
  }
  assert.equal((await state(db)).length, SIX.length);
});

test("the queue refuses a duplicate job key for the same workspace", async () => {
  const db = await freshDb();
  await apply(db, PLATFORM_ROLES_0063_DDL);
  await apply(db, TIKTOK_DDL);
  await apply(db, TIKTOK_PUBLISH_JOBS_0065_DDL);
  const org = "33333333-3333-3333-3333-333333333333";
  const user = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  await db.exec(`insert into "Organization" values ('${org}'); insert into "User" values ('${user}');`);
  const insert = `insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
                  values ('${org}','${user}','key-1','https://example.test/v.mp4')`;
  await db.exec(insert);
  await assert.rejects(() => db.exec(insert), /duplicate key|unique/i);
});

test("the down files reverse in opposite order and leave nothing behind", async () => {
  const db = await freshDb();
  await apply(db, PLATFORM_ROLES_0063_DDL);
  await apply(db, TIKTOK_DDL);
  await apply(db, TIKTOK_PUBLISH_JOBS_0065_DDL);
  await apply(db, DOWN("0065_tiktok_publish_jobs.down.sql"));
  await apply(db, DOWN("0064_tiktok_integration.down.sql"));
  await apply(db, DOWN("0063_platform_roles.down.sql"));
  assert.equal((await state(db)).length, 0);
});
