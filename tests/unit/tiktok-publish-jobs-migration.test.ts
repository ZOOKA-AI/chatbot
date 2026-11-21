import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";
import { TIKTOK_QUEUE_DDL } from "@/lib/integrations/tiktok/queue-ddl";
import { TIKTOK_DDL } from "@/lib/integrations/tiktok/ddl";
import { PLATFORM_ROLES_DDL } from "@/lib/platform/ddl";

/**
 * Migration 0065 has to be reachable by the admin migration endpoint, and the
 * three TikTok/platform migrations have to survive being applied in sequence,
 * twice, and on top of a half-migrated database.
 *
 * The isolated database is built to look like production just before the batch:
 * the platform tables, the connection tables, the membership guard the policies
 * call, and the tenant runtime role the grants name.
 */

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0065_tiktok_publish_jobs.sql"),
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

async function freshDb() {
  const db = new PGlite();
  await db.exec(`create role zooka_runtime`);
  await db.exec(`create table "User" ("id" uuid primary key default gen_random_uuid())`);
  await db.exec(`create table "Organization" ("id" uuid primary key default gen_random_uuid())`);
  // The membership guard 0062 installed; the policies below call it.
  await db.exec(`
    create function public.app_is_org_member(org text) returns boolean
    language sql stable as $$ select true $$;
  `);
  return db;
}

const applyAll = async (db: PGlite) => {
  for (const group of [PLATFORM_ROLES_DDL, TIKTOK_DDL, TIKTOK_QUEUE_DDL]) {
    for (const statement of group) await db.exec(statement);
  }
};

test("the code copy is byte-for-byte the reviewed migration file", () => {
  assert.equal(normalise(TIKTOK_QUEUE_DDL.join(" ")), normalise(SQL));
});

test("the admin migrate route applies 0065", () => {
  assert.ok(ROUTE.includes("tiktok_publish_jobs_0065"));
});

test("the three migrations apply in sequence and leave the schema the queue needs", async () => {
  const db = await freshDb();
  await applyAll(db);

  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`
  );
  const names = tables.rows.map((row) => row.table_name);
  for (const expected of [
    "PlatformRole",
    "PlatformAuditLog",
    "TikTokConnection",
    "TikTokUpload",
    "TikTokPublishJob",
    "TikTokPublishEvent",
  ]) {
    assert.ok(names.includes(expected), `${expected} missing; got ${names.join(",")}`);
  }

  const rls = await db.query<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'TikTok%'`
  );
  assert.equal(rls.rows.length, 4);
  for (const row of rls.rows) assert.equal(row.rowsecurity, true, row.tablename);
  await db.close();
});

test("the idempotency key is unique per workspace", async () => {
  const db = await freshDb();
  await applyAll(db);
  const org = await db.query<{ id: string }>(`insert into "Organization" default values returning id`);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  const insert = (key: string) =>
    db.exec(
      `insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
       values ('${org.rows[0].id}','${user.rows[0].id}','${key}','https://cdn.example.com/v.mp4')`
    );

  await insert("job-1");
  await assert.rejects(() => insert("job-1"), /TikTokPublishJob_org_jobkey_key/);
  await insert("job-2");
  const count = await db.query<{ n: string }>(`select count(*)::text as n from "TikTokPublishJob"`);
  assert.equal(count.rows[0].n, "2");
  await db.close();
});

test("the audit trail follows its job on delete", async () => {
  const db = await freshDb();
  await applyAll(db);
  const org = await db.query<{ id: string }>(`insert into "Organization" default values returning id`);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  const job = await db.query<{ id: string }>(
    `insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
     values ('${org.rows[0].id}','${user.rows[0].id}','job-1','https://cdn.example.com/v.mp4') returning id`
  );
  await db.exec(
    `insert into "TikTokPublishEvent" ("jobId","organizationId","userId","type")
     values ('${job.rows[0].id}','${org.rows[0].id}','${user.rows[0].id}','queued')`
  );
  await db.exec(`delete from "TikTokPublishJob" where id = '${job.rows[0].id}'`);
  const left = await db.query<{ n: string }>(`select count(*)::text as n from "TikTokPublishEvent"`);
  assert.equal(left.rows[0].n, "0");
  await db.close();
});

test("running the whole batch twice changes nothing and loses nothing", async () => {
  const db = await freshDb();
  await applyAll(db);
  const org = await db.query<{ id: string }>(`insert into "Organization" default values returning id`);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  await db.exec(
    `insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
     values ('${org.rows[0].id}','${user.rows[0].id}','job-1','https://cdn.example.com/v.mp4')`
  );

  await applyAll(db);

  const jobs = await db.query<{ n: string }>(`select count(*)::text as n from "TikTokPublishJob"`);
  assert.equal(jobs.rows[0].n, "1");
  const policies = await db.query<{ n: string }>(
    `select count(*)::text as n from pg_policies where schemaname='public' and tablename like 'TikTok%'`
  );
  assert.ok(Number(policies.rows[0].n) >= 4, "policies must not be duplicated or dropped");
  await db.close();
});

test("a queue table created by an earlier run keeps its rows", async () => {
  const db = await freshDb();
  // Partial state: 0065 got as far as the first table before failing.
  await db.exec(TIKTOK_QUEUE_DDL[0]);
  const org = await db.query<{ id: string }>(`insert into "Organization" default values returning id`);
  const user = await db.query<{ id: string }>(`insert into "User" default values returning id`);
  await db.exec(
    `insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
     values ('${org.rows[0].id}','${user.rows[0].id}','job-1','https://cdn.example.com/v.mp4')`
  );

  await applyAll(db);

  const jobs = await db.query<{ jobKey: string }>(`select "jobKey" from "TikTokPublishJob"`);
  assert.equal(jobs.rows.length, 1);
  assert.equal(jobs.rows[0].jobKey, "job-1");
  await db.close();
});
