import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { test } from "vitest";
import { webhookEvent } from "@/lib/db/schema";

const migration = readFileSync(
  new URL("../../lib/db/migrations/0020_webhook_event_drift.sql", import.meta.url),
  "utf8"
);
const productionTable = `
  CREATE TABLE "WebhookEvent" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "provider" varchar(32) NOT NULL,
    "externalId" text NOT NULL,
    "receivedAt" timestamp DEFAULT now() NOT NULL
  );
  CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_idx"
    ON "WebhookEvent" ("provider", "externalId");
`;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function createFromSchema(client: PGlite) {
  const config = getTableConfig(webhookEvent);
  const dialect = new PgDialect();
  const columns = config.columns.map((column) => {
    const defaultValue =
      column.default instanceof SQL
        ? ` DEFAULT ${dialect.sqlToQuery(column.default).sql}`
        : "";
    return `${quote(column.name)} ${column.getSQLType()}${defaultValue}${
      column.notNull ? " NOT NULL" : ""
    }${column.primary ? " PRIMARY KEY" : ""}`;
  });
  const constraints = config.uniqueConstraints.map(
    (constraint) =>
      `CONSTRAINT ${quote(constraint.getName()!)} UNIQUE (${constraint.columns
        .map((column) => quote(column.name))
        .join(", ")})`
  );
  await client.exec(
    `CREATE TABLE ${quote(config.name)} (${[...columns, ...constraints].join(", ")});`
  );
  for (const index of config.indexes) {
    const names = index.config.columns.map((column) => {
      assert.ok("name" in column && column.name);
      return quote(column.name);
    });
    await client.exec(
      `CREATE INDEX ${quote(index.config.name!)} ON ${quote(config.name)} (${names.join(", ")});`
    );
  }
}

async function shape(client: PGlite) {
  const columns = await client.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WebhookEvent'
    ORDER BY column_name
  `);
  const constraints = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid = '"WebhookEvent"'::regclass
    ORDER BY conname
  `);
  const indexes = await client.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'WebhookEvent'
    ORDER BY indexname
  `);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}

for (const populated of [false, true]) {
  test(`repair matches schema and is repeatable on a ${populated ? "populated" : "empty"} production table`, async () => {
    const production = new PGlite();
    const expected = new PGlite();
    try {
      await production.exec(productionTable);
      await createFromSchema(expected);
      if (populated) {
        await production.exec(`
          INSERT INTO "WebhookEvent" ("id", "provider", "externalId", "receivedAt")
          VALUES ('11111111-1111-4111-8111-111111111111', 'stripe', 'event-1', '2024-01-02');
        `);
      }
      await production.exec(migration);
      await production.exec(migration);
      assert.deepEqual(await shape(production), await shape(expected));
      if (populated) {
        const rows = await production.query(`
          SELECT "id", "provider", "externalId", "payload", "receivedAt"::text
          FROM "WebhookEvent"
        `);
        assert.deepEqual(rows.rows, [{
          id: "11111111-1111-4111-8111-111111111111",
          provider: "stripe",
          externalId: "event-1",
          payload: null,
          receivedAt: "2024-01-02 00:00:00",
        }]);
        await assert.rejects(production.exec(`
          INSERT INTO "WebhookEvent" ("provider", "externalId") VALUES ('stripe', 'event-1')
        `));
      }
      await expected.exec(migration);
      await expected.exec(migration);
      assert.deepEqual(await shape(production), await shape(expected));
    } finally {
      await production.close();
      await expected.close();
    }
  }, 120_000);
}

test("repair adds a constraint if the legacy index is absent", async () => {
  const client = new PGlite();
  try {
    await client.exec(productionTable);
    await client.exec('DROP INDEX "WebhookEvent_provider_externalId_idx"');
    await client.exec(migration);
    await client.exec(migration);
    const constraints = await client.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint WHERE conrelid = '"WebhookEvent"'::regclass
    `);
    assert.ok(constraints.rows.some((row) => row.conname === "WebhookEvent_provider_externalId_key"));
  } finally {
    await client.close();
  }
}, 120_000);

for (const suffix of ["x", " "]) {
  test(`repair preserves an overlong ID ending in ${JSON.stringify(suffix)}`, async () => {
    const client = new PGlite();
    try {
      await client.exec(productionTable);
      const externalId = `${"x".repeat(255)}${suffix}`;
      await client.query(
        'INSERT INTO "WebhookEvent" ("provider", "externalId") VALUES ($1, $2)',
        ["stripe", externalId]
      );
      await assert.rejects(client.exec(migration), /exceeds 255 characters/);
      const rows = await client.query<{ externalId: string }>(
        'SELECT "externalId" FROM "WebhookEvent"'
      );
      assert.equal(rows.rows[0]?.externalId, externalId);
    } finally {
      await client.close();
    }
  }, 120_000);
}
