import assert from "node:assert/strict";
import postgres from "postgres";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, test } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * Does a database built from the repository migrations satisfy the ORM?
 *
 * This is the question the drift report kept circling and not answering. Production
 * carries columns the ORM never reads (an older Auth.js layout, a vector column from
 * an abandoned feature) — those are noise. What matters is the opposite direction:
 * a column `schema.ts` selects, sorts by, or writes, that the migrations never
 * create. On such a database every query touching that column fails, and it fails in
 * production too the moment the two are reconciled.
 *
 * The check is structural: it reads the ORM's own table metadata and asks the live
 * catalogue whether each declared column is really there.
 */

const URL = process.env.ZOOKA_TEST_PG_REPO_DB;
const ready = Boolean(URL);

let sql: ReturnType<typeof postgres>;

const tables = () =>
  // Drizzle's table types are highly specific per table, so the narrowing is done
  // once here and the rest of the test works on plain metadata.
  (Object.values(schema).filter((value) => is(value as never, PgTable)) as PgTable[])
    // Drizzle relations and helper exports are not tables; the guard above filters
    // them, and this keeps the failure message honest about what was compared.
    .map((table) => ({
      name: getTableName(table),
      columns: Object.values(getTableColumns(table))
        .map((column) => column.name)
        .sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

beforeAll(async () => {
  if (!ready) return;
  sql = postgres(URL!, { max: 2 });
});

afterAll(async () => {
  if (ready) await sql.end({ timeout: 5 });
});

describe.skipIf(!ready)("the migrations produce the schema the ORM expects", () => {
  test("every table the ORM declares exists", async () => {
    const present = new Set(
      (await sql`select table_name from information_schema.tables where table_schema = 'public'`).map(
        (r) => r.table_name as string
      )
    );
    const missing = tables()
      .map((t) => t.name)
      .filter((name) => !present.has(name));
    assert.deepEqual(missing, [], `tables declared by schema.ts but absent after migrations: ${missing.join(", ")}`);
  });

  test("every column the ORM declares exists", async () => {
    const rows = await sql`
      select table_name, column_name from information_schema.columns where table_schema = 'public'`;
    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      const table = row.table_name as string;
      if (!actual.has(table)) actual.set(table, new Set());
      actual.get(table)!.add(row.column_name as string);
    }

    const gaps: string[] = [];
    for (const table of tables()) {
      const columns = actual.get(table.name);
      if (!columns) continue; // reported by the table test
      for (const column of table.columns) {
        if (!columns.has(column)) gaps.push(`${table.name}.${column}`);
      }
      // Extra columns in the database are tolerated on purpose: production has
      // legacy ones, and a migration that dropped them would destroy data nobody
      // asked to lose.
    }

    assert.deepEqual(gaps, [], `columns the ORM needs but migrations never create: ${gaps.join(", ")}`);
  });
});
