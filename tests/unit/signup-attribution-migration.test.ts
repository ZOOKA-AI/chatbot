import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

import { SIGNUP_ATTRIBUTION_DDL } from "@/lib/growth/ddl";

/**
 * Migration 0067 must not invent signup dates.
 *
 * The whole point of the column is to answer "when did this account arrive", and
 * a column that stamps every existing row with the migration's own clock answers
 * it wrongly for 281 real accounts. So the two claims tested here are:
 *
 *   1. the statements production runs are the reviewed file, and
 *   2. an account that existed before the migration keeps NULL, while an account
 *      created afterwards is stamped.
 *
 * An isolated Postgres is used because that is the only place these statements
 * can be exercised without touching production.
 */

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0067_signup_attribution.sql"),
  "utf8"
);

const normalise = (value: string) =>
  value
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/;\s*$/, "")
    .trim();

test("the code copy is the reviewed migration file", () => {
  const file = normalise(SQL)
    .split(/;\s*(?=ALTER)/)
    .map((part) => part.trim())
    .filter(Boolean);
  assert.deepEqual(
    file.map((part) => part.replace(/\s+/g, " ")),
    SIGNUP_ATTRIBUTION_DDL.map((statement) => normalise(statement))
  );
});

test("existing accounts keep an unknown date, new accounts are stamped", async () => {
  const db = new PGlite();
  await db.exec(`
    create table "User" (
      id uuid primary key default gen_random_uuid(),
      email varchar(64) not null,
      password varchar(64)
    );
  `);
  await db.exec(
    `insert into "User" (email) values ('before-0067@example.com')`
  );

  for (const statement of SIGNUP_ATTRIBUTION_DDL) {
    await db.exec(statement);
  }

  const before = await db.query<{ createdAt: string | null }>(
    `select "createdAt"::text as "createdAt" from "User" where email = 'before-0067@example.com'`
  );
  assert.equal(
    before.rows[0].createdAt,
    null,
    "a pre-migration account must not receive the migration timestamp as its signup date"
  );

  await db.exec(
    `insert into "User" (email, "signupSource", "signupMedium")
     values ('after-0067@example.com', 'chatgpt.com', 'referral')`
  );
  const after = await db.query<{ createdAt: string | null; source: string }>(
    `select "createdAt"::text as "createdAt", "signupSource" as source
     from "User" where email = 'after-0067@example.com'`
  );
  assert.ok(after.rows[0].createdAt, "a new account must be stamped");
  assert.equal(after.rows[0].source, "chatgpt.com");

  // Re-running must be a no-op: a failed batch is retried by the endpoint.
  for (const statement of SIGNUP_ATTRIBUTION_DDL) {
    await db.exec(statement);
  }
  const rows = await db.query<{ total: number }>(
    `select count(*)::int as total from "User"`
  );
  assert.equal(rows.rows[0].total, 2);

  await db.close();
});

test("attribution columns are nullable, so a direct visit stores no channel", async () => {
  const db = new PGlite();
  await db.exec(
    `create table "User" (id uuid primary key default gen_random_uuid(), email varchar(64) not null)`
  );
  for (const statement of SIGNUP_ATTRIBUTION_DDL) {
    await db.exec(statement);
  }
  await db.exec(`insert into "User" (email) values ('direct@example.com')`);
  const row = await db.query<{
    source: string | null;
    medium: string | null;
    campaign: string | null;
    referrer: string | null;
  }>(
    `select "signupSource" as source, "signupMedium" as medium,
            "signupCampaign" as campaign, "signupReferrer" as referrer
     from "User" where email = 'direct@example.com'`
  );
  assert.deepEqual(row.rows[0], {
    source: null,
    medium: null,
    campaign: null,
    referrer: null,
  });
  await db.close();
});

test("the admin migrate route applies 0067, so production can reach the columns", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/admin/migrate/route.ts"),
    "utf8"
  );
  assert.ok(
    route.includes("signup_attribution_0067"),
    "0067 is missing from the route registry, so the columns would never be created in production"
  );
});

test("the register action passes the captured channel into the account row", () => {
  const actions = readFileSync(
    join(process.cwd(), "app/(auth)/actions.ts"),
    "utf8"
  );
  assert.ok(
    actions.includes("ATTRIBUTION_COOKIE"),
    "the register action must read the first-touch cookie"
  );
  assert.match(
    actions,
    /createUser\(email, password, attribution\)/,
    "the channel must reach createUser, otherwise the column is written empty forever"
  );
});

test("the exact column set createUser writes is accepted by the migrated schema", async () => {
  const db = new PGlite();
  await db.exec(
    `create table "User" (id uuid primary key default gen_random_uuid(), email varchar(64) not null, password varchar(64))`
  );
  for (const statement of SIGNUP_ATTRIBUTION_DDL) {
    await db.exec(statement);
  }
  await db.exec(`
    insert into "User" (email, password, "signupSource", "signupMedium", "signupCampaign", "signupReferrer")
    values ('full@example.com', 'hash', 'linkedin.com', 'social', 'launch', 'https://www.linkedin.com/feed/')
  `);
  const row = await db.query<{ stamped: boolean; source: string }>(
    `select ("createdAt" is not null) as stamped, "signupSource" as source
     from "User" where email = 'full@example.com'`
  );
  assert.equal(row.rows[0].stamped, true);
  assert.equal(row.rows[0].source, "linkedin.com");
  await db.close();
});
