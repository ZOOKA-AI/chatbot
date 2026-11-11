import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { test } from "vitest";
import { mediaJobUpdateQuery } from "@/lib/db/media-job-state";

const folder = fileURLToPath(
  new URL("../../lib/db/migrations", import.meta.url)
);
const org = "11111111-1111-4111-8111-111111111111";
const job = "22222222-2222-4222-8222-222222222222";

test("the journal loads and applies on isolated PostgreSQL, and reruns safely", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    const files = readMigrationFiles({ migrationsFolder: folder });
    assert.ok(
      files.some((file) =>
        file.sql.some((text) =>
          text.includes('CREATE TABLE IF NOT EXISTS "WebhookEvent"')
        )
      )
    );
    assert.ok(
      files.some((file) =>
        file.sql.some((text) =>
          text.includes('CREATE TABLE IF NOT EXISTS "MediaJob"')
        )
      )
    );
    await migrate(db, { migrationsFolder: folder });
    await migrate(db, { migrationsFolder: folder });
    const generatedIndexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'MediaJob'"
    );
    assert.ok(
      generatedIndexes.rows.some(
        (row) => row.indexname === "MediaJob_organizationId_createdAt_idx"
      )
    );
    const count = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
    );
    assert.equal(count.rows[0]?.count, files.length);
    await client.exec(
      `INSERT INTO "Organization" ("id", "name") VALUES ('${org}', 'Isolated test'); INSERT INTO "MediaJob" ("id", "organizationId", "actionType", "prompt") VALUES ('${job}', '${org}', 'IMAGE', 'test');`
    );
    const update = (status: "running" | "succeeded" | "failed") =>
      db.execute(
        mediaJobUpdateQuery({
          id: job,
          status,
          assetUrl: "https://assets.example.test/output.png",
          error: "failure",
        })
      );
    assert.equal((await update("running")).rows.length, 1);
    assert.equal((await update("running")).rows.length, 0);
    // Competing terminal writes: only one statement may claim completion.
    const results = await Promise.all([update("succeeded"), update("failed")]);
    assert.equal(
      results.reduce((sum, result) => sum + result.rows.length, 0),
      1
    );
    assert.equal((await update("running")).rows.length, 0);
    assert.equal((await update("succeeded")).rows.length, 0);
    const failedId = "33333333-3333-4333-8333-333333333333";
    await client.query(
      'INSERT INTO "MediaJob" ("id", "organizationId", "actionType", "prompt") VALUES ($1, $2, $3, $4)',
      [failedId, org, "VIDEO", "test"]
    );
    assert.equal(
      (
        await db.execute(
          mediaJobUpdateQuery({
            id: failedId,
            status: "failed",
            error: "timeout",
          })
        )
      ).rows.length,
      1
    );
    assert.equal(
      (
        await db.execute(
          mediaJobUpdateQuery({
            id: failedId,
            status: "succeeded",
            assetUrl: "https://assets.example.test/late.mp4",
          })
        )
      ).rows.length,
      0
    );
    const state = await client.query<{ status: string; assetUrl: string }>(
      'SELECT "status", "assetUrl" FROM "MediaJob" WHERE "id" = $1',
      [job]
    );
    assert.equal(state.rows[0]?.status, "succeeded");
    assert.equal(
      state.rows[0]?.assetUrl,
      "https://assets.example.test/output.png"
    );
    await client.exec(
      `INSERT INTO "WebhookEvent" ("provider", "externalId") VALUES ('test', 'delivery');`
    );
    await assert.rejects(
      client.exec(
        `INSERT INTO "WebhookEvent" ("provider", "externalId") VALUES ('test', 'delivery');`
      )
    );
  } finally {
    await client.close();
  }
}, 60_000);

test("untracked legacy 0020 SQL is reviewed on an isolated schema, not production", async () => {
  const client = new PGlite();
  try {
    await client.exec('CREATE TABLE "Organization" ("id" uuid PRIMARY KEY);');
    const legacy = readFileSync(`${folder}/0020_media_job.sql`, "utf8");
    await client.exec(legacy);
    await client.exec(legacy);
    await client.exec(readFileSync(`${folder}/0015_media_job.sql`, "utf8"));
    await client.exec(
      readFileSync(`${folder}/0016_media_job_index.sql`, "utf8")
    );
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'MediaJob'"
    );
    assert.ok(
      indexes.rows.some(
        (row) => row.indexname === "MediaJob_organizationId_createdAt_idx"
      )
    );
  } finally {
    await client.close();
  }
}, 60_000);
