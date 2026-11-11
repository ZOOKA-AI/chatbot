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

const journalTags = (
  JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as {
    entries: { tag: string }[];
  }
).entries.map((entry) => entry.tag);

const sqlOf = (tag: string) => readFileSync(`${folder}/${tag}.sql`, "utf8");

const applyChain = async (client: PGlite, tags: string[]) => {
  for (const tag of tags) {
    await client.exec(sqlOf(tag));
  }
};

test("every migration in the journal applies on isolated PostgreSQL", async () => {
  const client = new PGlite();
  try {
    await applyChain(client, journalTags);
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const names = tables.rows.map((row) => row.table_name);
    for (const required of ["Organization", "MediaJob", "WebhookEvent"]) {
      assert.ok(names.includes(required), `missing table ${required}`);
    }
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
    );
    const indexNames = indexes.rows.map((row) => row.indexname);
    for (const required of [
      "MediaJob_organizationId_createdAt_idx",
      "WebhookEvent_receivedAt_idx",
    ]) {
      assert.ok(indexNames.includes(required), `missing index ${required}`);
    }
  } finally {
    await client.close();
  }
}, 120_000);

test("the media and webhook migrations are re-runnable", async () => {
  const client = new PGlite();
  try {
    const rerunnable = ["0015_media_job", "0016_media_job_index", "0019_webhook_event"];
    await client.exec('CREATE TABLE IF NOT EXISTS "Organization" ("id" uuid PRIMARY KEY);');
    await applyChain(client, rerunnable);
    await applyChain(client, rerunnable);
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'MediaJob'"
    );
    assert.ok(
      indexes.rows.some(
        (row) => row.indexname === "MediaJob_organizationId_createdAt_idx"
      )
    );
    const webhook = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name = 'WebhookEvent'"
    );
    assert.ok((webhook.rows[0]?.count ?? 0) >= 4);
  } finally {
    await client.close();
  }
}, 120_000);

test("the duplicate 0020 migration is gone and its objects still exist", async () => {
  assert.ok(!journalTags.includes("0020_media_job"));
  const client = new PGlite();
  try {
    await client.exec('CREATE TABLE IF NOT EXISTS "Organization" ("id" uuid PRIMARY KEY);');
    await applyChain(client, ["0015_media_job", "0016_media_job_index"]);
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    assert.ok(tables.rows.some((row) => row.table_name === "MediaJob"));
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
}, 120_000);
