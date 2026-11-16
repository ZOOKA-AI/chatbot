import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, test } from "vitest";

/**
 * A rollback that drops a table holding rows is data loss with a zero exit code.
 *
 * Static half: every DROP TABLE in a down file must be preceded by a guard, one per table, so a new migration
 * cannot join the set with an exposed drop.
 *
 * Dynamic half: every guard is executed against a real database, with and without rows. A comment is not a
 * control. This file exists because the first version of the guard had a missing quote and PostgreSQL answered
 * with a syntax error while a shell reported success.
 */

const DIR = join(process.cwd(), "lib/db/migrations/pending");

type DownFile = { name: string; sql: string };

function downFiles(): DownFile[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".down.sql"))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(DIR, f), "utf8") }));
}

const GUARD_RE = /DO \$\$[\s\S]*?END \$\$;/g;
const TABLE_RE = /to_regclass\('public\."([A-Za-z]+)"'\)/;

function guardsOf(sql: string): Array<{ table: string; block: string }> {
  return (sql.match(GUARD_RE) ?? [])
    .map((block) => {
      const m = block.match(TABLE_RE);
      return m ? { table: m[1], block } : null;
    })
    .filter((g): g is { table: string; block: string } => g !== null);
}

describe("static coverage", () => {
  test("every dropped table has its own guard", () => {
    const offenders: string[] = [];
    for (const file of downFiles()) {
      const drops = (file.sql.match(/DROP\s+TABLE/gi) ?? []).length;
      if (drops === 0) continue;
      const guards = guardsOf(file.sql).length;
      if (guards < drops) offenders.push(`${file.name}: ${drops} drops, ${guards} guards`);
    }
    assert.deepEqual(offenders, []);
  });

  test("the ten rollback files named by the directive are covered", () => {
    const guarded = downFiles()
      .filter((f) => guardsOf(f.sql).length > 0)
      .map((f) => f.name.replace(".down.sql", ""));
    for (const stem of [
      "0029_auth_email_verification",
      "0034_agent_execution",
      "0035_worker_lease_and_scheduler",
      "0038_schedule_and_agent_model",
      "0039_launch_plan",
      "0041_workspace_projects",
      "0042_project_documents",
      "0043_browser_sessions",
      "0044_studio_media",
      "0045_spend_approvals",
    ]) {
      assert.ok(guarded.includes(stem), `${stem} must carry a guard`);
    }
  });

  test("all ten guard files together protect every table they drop", () => {
    const tables = downFiles().flatMap((f) => guardsOf(f.sql).map((g) => g.table));
    assert.ok(tables.length >= 10, `expected at least ten guarded tables, saw ${tables.length}`);
    assert.equal(new Set(tables).size, tables.length, "no table should be guarded twice in one file");
  });
});

describe("dynamic behaviour", () => {
  const guarded = downFiles().flatMap((f) =>
    guardsOf(f.sql).map((g) => ({ file: f.name, ...g }))
  );

  for (const { file, table, block } of guarded) {
    test(`${file}: refuses to drop "${table}" while it holds rows`, async () => {
      const pg = new PGlite();
      await pg.exec(`CREATE TABLE "${table}" (id serial primary key); INSERT INTO "${table}" DEFAULT VALUES;`);

      await assert.rejects(
        () => pg.exec(block),
        (error: Error) => /forward_only/.test(error.message),
        "a populated table must stop the rollback"
      );

      const { rows } = await pg.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
      assert.equal(rows[0].n, "1", "the row must survive the refusal");
    });

    test(`${file}: stays quiet when "${table}" is empty`, async () => {
      const pg = new PGlite();
      await pg.exec(`CREATE TABLE "${table}" (id serial primary key);`);
      await pg.exec(block);
      const { rows } = await pg.query(`SELECT to_regclass('public."${table}"') AS present`);
      assert.ok((rows[0] as { present: string | null }).present, "the guard must not drop an empty table");
    });

    test(`${file}: is a no-op when "${table}" never existed`, async () => {
      const pg = new PGlite();
      await pg.exec(block);
    });
  }
});
