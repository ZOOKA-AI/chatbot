import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { test } from "vitest";
import { migratePglite } from "../helpers/migrate-pglite";

const folder = fileURLToPath(
  new URL("../../lib/db/migrations", import.meta.url)
);
test("real journal, SQL bytes and history execute once through simple-protocol migration adapter", async () => {
  const client = new PGlite();
  try {
    await migratePglite(client, { migrationsFolder: folder });
    const files = readMigrationFiles({ migrationsFolder: folder });
    const before = await client.query<{ hash: string; created_at: string }>(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
    );
    assert.deepEqual(
      before.rows.map((row) => row.hash),
      files.map((file) => file.hash)
    );
    assert.deepEqual(
      before.rows.map((row) => Number(row.created_at)),
      files.map((file) => file.folderMillis)
    );
    await migratePglite(client, { migrationsFolder: folder });
    const after = await client.query(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
    );
    assert.deepEqual(after.rows, before.rows);
    assert.ok(
      readFileSync(`${folder}/0016_oauth_connection.sql`, "utf8").includes(
        "CREATE INDEX"
      )
    );
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename='OAuthConnection'"
    );
    assert.ok(
      indexes.rows.some(
        (row) => row.indexname === "OAuthConnection_provider_idx"
      )
    );
  } finally {
    await client.close();
  }
}, 60_000);

test("invalid multi-command migration rejects and rolls back objects and migration history", async () => {
  const folder = mkdtempSync(join(tmpdir(), "zooka-invalid-migration-"));
  const client = new PGlite();
  try {
    mkdirSync(join(folder, "meta"));
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          {
            idx: 0,
            version: "7",
            when: 1,
            tag: "0000_invalid",
            breakpoints: true,
          },
        ],
      })
    );
    writeFileSync(
      join(folder, "0000_invalid.sql"),
      'CREATE TABLE "RollbackProbe" (id integer); INSERT INTO "MissingTable" VALUES (1);'
    );
    await assert.rejects(migratePglite(client, { migrationsFolder: folder }));
    const table = await client.query<{ name: string | null }>(
      "SELECT to_regclass('public.\"RollbackProbe\"')::text AS name"
    );
    assert.equal(table.rows[0]?.name, null);
    const history = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
    );
    assert.equal(history.rows[0]?.count, 0);
  } finally {
    await client.close();
    rmSync(folder, { recursive: true });
  }
}, 60_000);
