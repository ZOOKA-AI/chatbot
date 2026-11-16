import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, test } from "vitest";

/**
 * Migration 0041 against both shapes of database it will meet.
 *
 * A workspace project may point at the hosted site it produced. That link must exist where the
 * site table exists, and must not stop the migration where it does not — a deployment whose
 * schema came from the agent migrations alone still needs the workspace project table. This test
 * exists because an unconditional foreign key broke exactly that case.
 */

const migration = (name: string) => readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");

/**
 * The tables 0041 links to. Kept to the minimum so the test stays about 0041 rather than about
 * the whole chain: the command-centre tables, the tenant column, the schedule table, and nothing
 * from the hosted-site side.
 */
async function base(pg: PGlite) {
  await apply(pg, migration("0027_agent_command_center.sql"));
  await apply(pg, migration("pending/0028_agent_tenant_scope.sql"));
  await apply(pg, migration("pending/0038_schedule_and_agent_model.sql"));
}

async function apply(pg: PGlite, sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

let pg: PGlite | null = null;

afterEach(async () => {
  if (pg) {
    await pg.close();
    pg = null;
  }
});

describe("0041 with the hosted-site table present", () => {
  test("creates the project table and the optional link", async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE "Project" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text)`);
    await base(pg);
    await apply(pg, migration("pending/0041_workspace_projects.sql"));

    const table = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables where table_name = 'AgentProject'`
    );
    assert.equal(table.rows[0].count, 1);

    // confdeltype 'n' is ON DELETE SET NULL: deleting the hosted site must not delete the project.
    const link = await pg.query<{ confdeltype: string }>(
      `select confdeltype from pg_constraint where conname = 'AgentProject_siteProjectId_fkey'`
    );
    assert.equal(link.rows[0]?.confdeltype, "n");
  });
});

describe("0041 with the hosted-site table absent", () => {
  test("still applies, and simply omits the link", async () => {
    pg = new PGlite();
    await base(pg);
    await apply(pg, migration("pending/0041_workspace_projects.sql"));

    const table = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables where table_name = 'AgentProject'`
    );
    assert.equal(table.rows[0].count, 1);

    const fk = await pg.query<{ count: number }>(
      `select count(*)::int as count from pg_constraint where conname = 'AgentProject_siteProjectId_fkey'`
    );
    assert.equal(fk.rows[0].count, 0);

    // The column is still there, so a later deployment that adds the site table can attach it.
    const column = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.columns
       where table_name = 'AgentProject' and column_name = 'siteProjectId'`
    );
    assert.equal(column.rows[0].count, 1);
  });

  test("the tenant columns and policy are unconditional", async () => {
    pg = new PGlite();
    await base(pg);
    await apply(pg, migration("pending/0041_workspace_projects.sql"));

    const columns = await pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'AgentTask' and column_name = 'projectId'`
    );
    assert.equal(columns.rows.length, 1);

    const policy = await pg.query<{ count: number }>(
      `select count(*)::int as count from pg_policies where tablename = 'AgentProject'`
    );
    assert.equal(policy.rows[0].count, 1);
  });
});
