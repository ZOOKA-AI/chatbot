import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import {
  PLATFORM_ROLES_0063_DDL,
  TIKTOK_PUBLISH_JOBS_0065_DDL,
} from "@/lib/db/ddl/registry";
import { splitSql } from "../helpers/split-sql";

/**
 * The admin migration endpoint is the only path that touches the production
 * schema. A pending file it does not list is never applied, and the endpoint
 * still answers 200 with an empty failure map - which is how 0063 and 0065 sat
 * unapplied while every run reported success. These tests make that silence
 * impossible: the registry arrays must equal the files, and the route must
 * reference both.
 */

const normalise = (statement: string) =>
  statement.trim().replace(/\s+/g, " ").toLowerCase();

function statementsOf(file: string): string[] {
  const raw = readFileSync(join(process.cwd(), "lib/db/migrations/pending", file), "utf8");
  return splitSql(raw).map(normalise).filter((statement) => statement.length > 0);
}

const route = () =>
  readFileSync(join(process.cwd(), "app/api/admin/migrate/route.ts"), "utf8");

test("0063 in the registry equals the pending file", () => {
  assert.deepEqual(
    PLATFORM_ROLES_0063_DDL.map(normalise),
    statementsOf("0063_platform_roles.sql")
  );
});

test("0065 in the registry equals the pending file", () => {
  assert.deepEqual(
    TIKTOK_PUBLISH_JOBS_0065_DDL.map(normalise),
    statementsOf("0065_tiktok_publish_jobs.sql")
  );
});

test("the route references every migration the release needs", () => {
  const source = route();
  for (const key of [
    "platform_roles_0063",
    "tiktok_integration_0064",
    "tiktok_publish_jobs_0065",
  ]) {
    assert.equal(
      source.includes(key),
      true,
      `${key} must be in the registry or it will never be applied in production`
    );
  }
});

test("the registry creates the queue with the columns the runner reads", () => {
  const joined = TIKTOK_PUBLISH_JOBS_0065_DDL.join(" ").toLowerCase();
  for (const column of [
    "jobkey",
    "status",
    "attempts",
    "claimedat",
    "publishid",
    "lasterror",
    "nextattemptat",
  ]) {
    assert.equal(joined.includes(column), true, `TikTokPublishJob needs ${column}`);
  }
  // A tenant table without RLS is refused by the runtime-grant guard (0058).
  assert.equal(joined.includes('enable row level security'), true);
  assert.equal(joined.includes("app_is_org_member"), true);
});
