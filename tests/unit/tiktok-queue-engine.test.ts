import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { test } from "vitest";
import { db as appDb } from "@/lib/db/queries";
import {
  applyReconciliation,
  claimDueJobs,
  claimReconcileJobs,
  listTenantsWithDueWork,
  MAX_ATTEMPTS,
  RECONCILE_STATUS,
} from "@/lib/integrations/tiktok/queue";

/**
 * The queue engine against a real Postgres, not a mock.
 *
 * The properties asserted here are the ones that lose a customer's video if they
 * break: one worker wins a claim, a crashed worker's row comes back after the
 * lease, a held row can never be claimed as fresh work, and a workspace never
 * sees another workspace's queued post.
 *
 * PGlite is a single connection, so "concurrent" is demonstrated the way the
 * database itself serialises it: the second claimer reads the same row already
 * CLAIMED and its UPDATE matches nothing. Cross-tenant isolation at the SQL
 * level is proven separately by the RLS test in tiktok-queue-migration.test.ts;
 * here it is the query predicate that is under test.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const UP = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0065_tiktok_publish_jobs.sql"),
  "utf8"
);

type Handle = typeof appDb;

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
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
  for (const statement of UP.split(";")) {
    if (statement.trim().length > 0) {
      await pg.exec(statement);
    }
  }
  await pg.exec(`insert into "Organization" values ('${ORG_A}'), ('${ORG_B}');`);
  await pg.exec(`insert into "User" values ('${USER_A}'), ('${USER_B}');`);
  return { pg, handle: drizzle(pg) as unknown as Handle };
}

async function enqueue(
  pg: PGlite,
  jobKey: string,
  org = ORG_A,
  user = USER_A,
  extra: Record<string, unknown> = {}
) {
  const columns = ["organizationId", "userId", "jobKey", "mediaUrl", ...Object.keys(extra)];
  const values = [`'${org}'`, `'${user}'`, `'${jobKey}'`, "'https://cdn.example/a.mp4'"];
  for (const key of Object.keys(extra)) {
    const value = extra[key];
    values.push(
      value === null ? "null" : typeof value === "number" ? String(value) : `'${String(value)}'`
    );
  }
  await pg.exec(
    `insert into "TikTokPublishJob" (${columns.map((c) => `"${c}"`).join(",")}) values (${values.join(",")})`
  );
}

async function statusOf(pg: PGlite, jobKey: string) {
  const r = await pg.query<{ status: string; attempts: number; claimedAt: string | null }>(
    `select status, attempts, "claimedAt" from "TikTokPublishJob" where "jobKey" = '${jobKey}'`
  );
  return r.rows[0];
}

test("only one worker wins a claim, and the loser gets nothing", async () => {
  const { pg, handle } = await setup();
  await enqueue(pg, "job-1");

  const first = await claimDueJobs(ORG_A, 5, Date.now(), handle);
  const second = await claimDueJobs(ORG_A, 5, Date.now(), handle);

  assert.equal(first.length, 1, "the first worker claims the due job");
  assert.equal(second.length, 0, "the second worker must not claim it again");
  const row = await statusOf(pg, "job-1");
  assert.equal(row.status, "CLAIMED");
  assert.equal(row.attempts, 1);
});

test("a crashed worker's row returns after the lease, not before", async () => {
  const { pg, handle } = await setup();
  const now = Date.now();
  await enqueue(pg, "job-crash", ORG_A, USER_A, {
    claimedAt: new Date(now).toISOString(),
    attempts: 1,
  });

  assert.equal(
    (await claimDueJobs(ORG_A, 5, now, handle)).length,
    0,
    "a live lease is respected"
  );

  const later = now + 11 * 60 * 1000;
  const reclaimed = await claimDueJobs(ORG_A, 5, later, handle);
  assert.equal(reclaimed.length, 1, "an expired lease is reclaimed");
  const row = await statusOf(pg, "job-crash");
  assert.equal(row.attempts, 2, "reclaiming counts as a new attempt");
});

test("a held row is invisible to the publisher and visible to reconciliation", async () => {
  const { pg, handle } = await setup();
  await enqueue(pg, "job-held", ORG_A, USER_A, { status: RECONCILE_STATUS });

  assert.equal(
    (await claimDueJobs(ORG_A, 5, Date.now(), handle)).length,
    0,
    "a held job must never be picked up as fresh work"
  );

  const held = await claimReconcileJobs(ORG_A, 5, Date.now(), handle);
  assert.equal(held.length, 1, "reconciliation can see it");
  assert.equal(
    (await statusOf(pg, "job-held")).attempts,
    0,
    "reconciling is not a publish attempt and must not consume the retry budget"
  );
});

test("a settled answer closes the job, an unknown answer keeps it held", async () => {
  const { pg, handle } = await setup();
  await enqueue(pg, "job-settled", ORG_A, USER_A, {
    status: RECONCILE_STATUS,
    attempts: 2,
  });
  await enqueue(pg, "job-unknown", ORG_A, USER_A, { status: RECONCILE_STATUS, attempts: 2 });

  // One at a time, so each answer is applied to a known row.
  const settledId = (await claimReconcileJobs(ORG_A, 1, Date.now(), handle))[0].id;
  await applyReconciliation({
    id: settledId,
    outcome: "settled",
    attempts: 2,
    publishId: "pub-1",
    handle,
  });
  assert.equal((await statusOf(pg, "job-settled")).status, "UPLOADED");

  const stillHeld = await claimReconcileJobs(ORG_A, 1, Date.now(), handle);
  assert.equal(stillHeld.length, 1);
  await applyReconciliation({
    id: stillHeld[0].id,
    outcome: "unknown",
    attempts: 2,
    publishId: "pub-2",
    handle,
  });
  const row = await statusOf(pg, "job-unknown");
  assert.equal(row.status, RECONCILE_STATUS, "an unknown answer must not become a retry");
});

test("the attempt cap and the backoff gate both hold", async () => {
  const { pg, handle } = await setup();
  const now = Date.now();
  await enqueue(pg, "job-capped", ORG_A, USER_A, { attempts: MAX_ATTEMPTS });
  await enqueue(pg, "job-waiting", ORG_A, USER_A, {
    nextAttemptAt: new Date(now + 5 * 60 * 1000).toISOString(),
  });

  const claimed = await claimDueJobs(ORG_A, 5, now, handle);
  assert.equal(claimed.length, 0, "a capped or waiting job is not claimed");
});

test("a workspace never claims another workspace's post", async () => {
  const { pg, handle } = await setup();
  await enqueue(pg, "job-b", ORG_B, USER_B);

  assert.equal(
    (await claimDueJobs(ORG_A, 5, Date.now(), handle)).length,
    0,
    "workspace A must not see workspace B's job"
  );
  const b = await claimDueJobs(ORG_B, 5, Date.now(), handle);
  assert.equal(b.length, 1, "workspace B claims its own job");
});

test("the coordinator finds both tenants without being told which", async () => {
  const { pg, handle } = await setup();
  await enqueue(pg, "job-a", ORG_A, USER_A);
  await enqueue(pg, "job-b", ORG_B, USER_B);
  await enqueue(pg, "job-dead", ORG_A, USER_A, { status: "DEAD", attempts: MAX_ATTEMPTS });

  const tenants = await listTenantsWithDueWork(10, Date.now(), handle);
  assert.deepEqual(
    [...tenants].sort(),
    [ORG_A, ORG_B].sort(),
    "each organization with work appears exactly once, and a dead job adds no work"
  );
});
