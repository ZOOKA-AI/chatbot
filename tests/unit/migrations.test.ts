import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { test } from "vitest";

test("Drizzle can load the journal through the webhook idempotency migration", () => {
  // Uses Drizzle's actual loader without opening a database connection.
  // A journal entry pointing to a missing SQL file must fail this test.
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(
      new URL("../../lib/db/migrations", import.meta.url)
    ),
  });
  const webhookMigration = migrations.find((migration) =>
    migration.sql.some((statement) =>
      statement.includes('CREATE TABLE IF NOT EXISTS "WebhookEvent"')
    )
  );

  assert.ok(
    webhookMigration,
    "WebhookEvent must be reachable from the journal"
  );
  assert.ok(
    webhookMigration.sql.some((statement) =>
      statement.includes('UNIQUE("provider","externalId")')
    ),
    "The webhook migration must retain the provider/externalId unique constraint"
  );
  assert.ok(
    webhookMigration.sql.some((statement) =>
      statement.includes(
        'CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx"'
      )
    ),
    "The webhook migration must retain the receivedAt index"
  );
});
