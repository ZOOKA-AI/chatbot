import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

/**
 * Migration 0065 on a disposable in-process Postgres.
 *
 * It is the queue n8n drains, so the two things that must be true are: a second
 * workspace cannot read the first workspace's queued posts, and the rollback
 * refuses to drop a table that still holds somebody's scheduled video.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const UP = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0065_tiktok_publish_jobs.sql"),
  "utf8"
);
const DOWN = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0065_tiktok_publish_jobs.down.sql"),
  "utf8"
);

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

async function apply(db: PGlite, script: string) {
  for (const statement of script.split(";")) {
    if (statement.trim().length > 0) {
      await db.exec(statement);
    }
  }
}

async function exists(db: PGlite): Promise<boolean> {
  const r = await db.query<{ ok: boolean }>(
    `select to_regclass('public."TikTokPublishJob"') is not null as ok`
  );
  return r.rows[0]?.ok ?? false;
}

test("0065 creates the queue with RLS, a membership policy and both foreign keys", async () => {
  const db = await freshDb();
  await apply(db, UP);

  const table = await db.query<{ relrowsecurity: boolean }>(
    `select relrowsecurity from pg_class where relname = 'TikTokPublishJob'`
  );
  assert.equal(table.rows[0]?.relrowsecurity, true, "RLS must be on");

  const policy = await db.query<{ qual: string }>(
    `select qual from pg_policies where policyname = 'TikTokPublishJob_tenant'`
  );
  assert.equal(policy.rows.length, 1);
  assert.match(policy.rows[0].qual, /organizationId/);
  assert.match(policy.rows[0].qual, /app\.organization_id/);
  assert.match(policy.rows[0].qual, /app_is_org_member/, "membership guard");

  const fks = await db.query<{ confrelid: string }>(
    `select confrelid::regclass::text as confrelid from pg_constraint
     where contype = 'f' and conrelid = 'public."TikTokPublishJob"'::regclass`
  );
  const targets = fks.rows.map((r) => r.confrelid).sort();
  assert.deepEqual(targets, ['"Organization"', '"User"']);

  // A second run must be a no-op: the migrate endpoint is retried.
  await apply(db, UP);
  assert.equal(await exists(db), true);
  await db.close();
});

test("the job key is unique per workspace, so a retried request cannot upload twice", async () => {
  const db = await freshDb();
  await apply(db, UP);
  await db.exec(`
    insert into "Organization" ("id") values ('${ORG_A}'), ('${ORG_B}');
    insert into "User" ("id") values ('${USER_A}');
    insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
    values ('${ORG_A}','${USER_A}','job-1','https://cdn.example.com/a.mp4');
  `);
  await assert.rejects(
    () =>
      db.exec(`
        insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
        values ('${ORG_A}','${USER_A}','job-1','https://cdn.example.com/b.mp4');
      `),
    /duplicate key|unique/i
  );
  // The same key in a different workspace is a different job.
  await db.exec(`
    insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
    values ('${ORG_B}','${USER_A}','job-1','https://cdn.example.com/c.mp4');
  `);
  const count = await db.query<{ n: number }>(
    `select count(*)::int as n from "TikTokPublishJob"`
  );
  assert.equal(count.rows[0].n, 2);
  await db.close();
});

test("one workspace cannot read another workspace's queue", async () => {
  const db = await freshDb();
  await apply(db, UP);
  await db.exec(`
    insert into "Organization" ("id") values ('${ORG_A}'), ('${ORG_B}');
    insert into "User" ("id") values ('${USER_A}');
    insert into public.org_member (org, member) values ('${ORG_A}', true), ('${ORG_B}', false);
    insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
    values ('${ORG_A}','${USER_A}','a-1','https://cdn.example.com/a.mp4'),
           ('${ORG_B}','${USER_A}','b-1','https://cdn.example.com/b.mp4');
  `);
  await db.exec(`set role zooka_runtime;`);

  await db.exec(`select set_config('app.organization_id','${ORG_A}',false);`);
  const a = await db.query<{ jobKey: string }>(
    `select "jobKey" from "TikTokPublishJob"`
  );
  assert.deepEqual(a.rows.map((r) => r.jobKey), ["a-1"]);

  await db.exec(`select set_config('app.organization_id','${ORG_B}',false);`);
  const b = await db.query(`select "jobKey" from "TikTokPublishJob"`);
  assert.equal(b.rows.length, 0, "a non-member must see nothing");

  await db.exec(`select set_config('app.organization_id','',false);`);
  const none = await db.query(`select "jobKey" from "TikTokPublishJob"`);
  assert.equal(none.rows.length, 0, "an empty tenant context fails closed");
  await db.exec(`reset role;`);
  await db.close();
});

test("the rollback refuses while a video is still queued, then succeeds when empty", async () => {
  const db = await freshDb();
  await apply(db, UP);
  await db.exec(`
    insert into "Organization" ("id") values ('${ORG_A}');
    insert into "User" ("id") values ('${USER_A}');
    insert into "TikTokPublishJob" ("organizationId","userId","jobKey","mediaUrl")
    values ('${ORG_A}','${USER_A}','a-1','https://cdn.example.com/a.mp4');
  `);
  await assert.rejects(() => db.exec(DOWN), /forward_only/);
  assert.equal(await exists(db), true, "nothing may be dropped");

  await db.exec(`delete from "TikTokPublishJob"`);
  await db.exec(DOWN);
  assert.equal(await exists(db), false, "down removes the table when empty");

  await apply(db, UP);
  assert.equal(await exists(db), true, "up after down recreates it");
  await db.close();
});
