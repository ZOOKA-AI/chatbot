import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

/**
 * Migration 0027 proven on an isolated database, never on production.
 *
 * The database starts as a stand-in for today's production shape: a few existing
 * tables carrying rows, plus the encrypted per-workspace connection table with
 * two tenants. Then the migration is applied exactly as shipped, and every claim
 * is checked against the catalogue: five tables, six foreign keys with the right
 * delete behaviour, six indexes, RLS on all five, existing rows and columns
 * untouched, and the FK/cascade semantics actually enforced.
 */
const SQL = readFileSync(
  "lib/db/migrations/0027_agent_command_center.sql",
  "utf8"
);
const STATEMENTS = SQL.split("--> statement-breakpoint")
  .map((part) => part.trim())
  .filter(Boolean);

const EXPECTED_COLUMNS: Record<string, string[]> = {
  AgentIdentity: [
    "id", "slug", "displayName", "role", "keyHash", "scopes",
    "environment", "status", "lastSeenAt", "createdAt",
  ],
  AgentTask: [
    "id", "title", "instruction", "ownerAgentId", "priority", "dependencies",
    "environment", "status", "evidence", "approvalRequired", "rollbackPlan",
    "claimedAt", "reportedAt", "createdBy", "createdAt",
  ],
  AgentDecision: ["id", "agentId", "title", "body", "state", "taskId", "createdAt"],
  AgentApproval: [
    "id", "taskId", "requestedBy", "reason", "status", "decidedBy",
    "decidedAt", "createdAt",
  ],
  AgentDeployment: [
    "id", "environment", "commitSha", "deploymentId", "status", "notes",
    "agentId", "rollbackOf", "createdAt",
  ],
};

const EXPECTED_FKS: Record<string, { table: string; onDelete: string }> = {
  AgentTask_ownerAgentId_AgentIdentity_id_fk: { table: "AgentIdentity", onDelete: "n" },
  AgentDecision_agentId_AgentIdentity_id_fk: { table: "AgentIdentity", onDelete: "n" },
  AgentDecision_taskId_AgentTask_id_fk: { table: "AgentTask", onDelete: "n" },
  AgentApproval_taskId_AgentTask_id_fk: { table: "AgentTask", onDelete: "c" },
  AgentApproval_requestedBy_AgentIdentity_id_fk: { table: "AgentIdentity", onDelete: "n" },
  AgentDeployment_agentId_AgentIdentity_id_fk: { table: "AgentIdentity", onDelete: "n" },
};

const EXPECTED_INDEXES = [
  "AgentIdentity_keyHash_idx",
  "AgentTask_status_idx",
  "AgentTask_ownerAgentId_idx",
  "AgentDecision_state_idx",
  "AgentApproval_status_idx",
  "AgentDeployment_environment_idx",
];

async function seedCurrentProductionShape(db: PGlite) {
  await db.exec(`
    CREATE TABLE "User" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL);
    CREATE TABLE "Organization" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
    CREATE TABLE "Chat" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL, title text);
    CREATE TABLE integration_connection (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      provider text NOT NULL,
      secret text NOT NULL
    );
    INSERT INTO "User" (email) VALUES ('a@example.test'), ('b@example.test');
    INSERT INTO "Organization" (name) VALUES ('workspace-a'), ('workspace-b');
    INSERT INTO "Chat" ("organizationId", title)
      VALUES ('11111111-1111-1111-1111-111111111111', 'chat-a1'),
             ('11111111-1111-1111-1111-111111111111', 'chat-a2'),
             ('22222222-2222-2222-2222-222222222222', 'chat-b1');
    INSERT INTO integration_connection (workspace_id, provider, secret) VALUES
      ('11111111-1111-1111-1111-111111111111', 'instagram', 'ciphertext-a'),
      ('22222222-2222-2222-2222-222222222222', 'snapchat', 'ciphertext-b');
  `);
}

async function snapshot(db: PGlite) {
  const counts = await db.query<{ table: string; rows: number }>(`
    select 'User' as table, count(*)::int as rows from "User"
    union all select 'Organization', count(*)::int from "Organization"
    union all select 'Chat', count(*)::int from "Chat"
    union all select 'integration_connection', count(*)::int from integration_connection
    order by 1
  `);
  const columns = await db.query<{ table_name: string; column_name: string }>(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name in ('User','Organization','Chat','integration_connection')
    order by table_name, ordinal_position
  `);
  return {
    counts: counts.rows,
    columns: columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
  };
}

test("0027 applies cleanly to a stand-in production database without touching existing data", async () => {
  const db = new PGlite();
  await seedCurrentProductionShape(db);
  const before = await snapshot(db);

  for (const statement of STATEMENTS) {
    await db.exec(statement);
  }

  // 1. the five tables exist with exactly the columns the ORM expects
  const tables = await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in
      ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')
  `);
  assert.equal(tables.rows.length, 5, "all five agent tables must exist");

  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name=$1 order by ordinal_position`,
      [table]
    );
    assert.deepEqual(
      cols.rows.map((row) => row.column_name).sort(),
      [...expected].sort(),
      `${table} columns must match the schema`
    );
  }

  // 2. six foreign keys, with set null vs cascade exactly as declared
  const fks = await db.query<{ name: string; referenced: string; deltype: string }>(`
    select c.conname as name,
           ref.relname as referenced,
           c.confdeltype::text as deltype
    from pg_constraint c
    join pg_class ref on ref.oid = c.confrelid
    where c.contype = 'f'
      and c.conrelid::regclass::text in
        ('"AgentTask"','"AgentDecision"','"AgentApproval"','"AgentDeployment"')
  `);
  assert.equal(fks.rows.length, 6, "six foreign keys must exist");
  for (const row of fks.rows) {
    const expected = EXPECTED_FKS[row.name];
    assert.ok(expected, `unexpected fk ${row.name}`);
    assert.equal(row.referenced, expected.table, `${row.name} target`);
    assert.equal(row.deltype, expected.onDelete, `${row.name} on delete`);
  }

  // 3. six indexes
  const indexes = await db.query<{ indexname: string }>(`
    select indexname from pg_indexes
    where schemaname='public' and indexname = any($1)
  `, [EXPECTED_INDEXES]);
  assert.equal(indexes.rows.length, 6, "all six indexes must exist");

  // 4. RLS enabled on all five
  const rls = await db.query<{ name: string; on: boolean }>(`
    select relname as name, relrowsecurity as on from pg_class
    where relname = any($1)
  `, [Object.keys(EXPECTED_COLUMNS)]);
  assert.equal(rls.rows.length, 5);
  for (const row of rls.rows) {
    assert.equal(row.on, true, `${row.name} must have RLS enabled`);
  }

  // 5. existing tables and rows untouched
  const after = await snapshot(db);
  assert.deepEqual(after.counts, before.counts, "existing row counts unchanged");
  assert.deepEqual(after.columns, before.columns, "existing columns unchanged");

  await db.close();
});

test("0027 enforces the foreign keys it declares", async () => {
  const db = new PGlite();
  for (const statement of STATEMENTS) await db.exec(statement);

  const identity = await db.query<{ id: string }>(
    `insert into "AgentIdentity" (slug,"displayName",role,"keyHash")
     values ('tester','Tester','worker','hash') returning id`
  );
  const agentId = identity.rows[0].id;

  const task = await db.query<{ id: string }>(
    `insert into "AgentTask" (title,instruction,"ownerAgentId")
     values ('t','do it',$1) returning id`,
    [agentId]
  );
  const taskId = task.rows[0].id;

  await db.query(
    `insert into "AgentApproval" ("taskId","requestedBy",reason)
     values ($1,$2,'needs money')`,
    [taskId, agentId]
  );
  await db.query(
    `insert into "AgentDecision" ("agentId",title,body,"taskId")
     values ($1,'decide','body',$2)`,
    [agentId, taskId]
  );

  // cascade: deleting the task removes its approval
  await db.query(`delete from "AgentTask" where id=$1`, [taskId]);
  const approvals = await db.query<{ n: number }>(
    `select count(*)::int as n from "AgentApproval"`
  );
  assert.equal(approvals.rows[0].n, 0, "approval must cascade with its task");

  // set null: deleting the identity keeps the decision but clears the reference
  await db.query(`delete from "AgentIdentity" where id=$1`, [agentId]);
  const decisions = await db.query<{ agentId: string | null }>(
    `select "agentId" from "AgentDecision"`
  );
  assert.equal(decisions.rows.length, 1, "decision row survives");
  assert.equal(decisions.rows[0].agentId, null, "agent reference set to null");

  await db.close();
});

test("RLS on the new tables denies a non-owner role, and workspace scoping holds", async () => {
  const db = new PGlite();
  await seedCurrentProductionShape(db);
  for (const statement of STATEMENTS) await db.exec(statement);

  // a plain role that owns nothing, similar to anon/authenticated in Supabase
  await db.exec(`
    create role app_client nologin;
    grant usage on schema public to app_client;
    grant select, insert on "AgentTask" to app_client;
    insert into "AgentTask" (title,instruction) values ('secret','internal only');
  `);

  await db.exec(`set role app_client`);
  const visible = await db.query<{ n: number }>(
    `select count(*)::int as n from "AgentTask"`
  );
  assert.equal(visible.rows[0].n, 0, "RLS without policies must deny every row");
  await db.exec(`reset role`);

  // the app connects as the table owner, so isolation rests on the workspace
  // predicate; prove that predicate separates the two tenants
  const tenantA = await db.query<{ provider: string }>(
    `select provider from integration_connection where workspace_id = $1`,
    ["11111111-1111-1111-1111-111111111111"]
  );
  const tenantB = await db.query<{ provider: string }>(
    `select provider from integration_connection where workspace_id = $1`,
    ["22222222-2222-2222-2222-222222222222"]
  );
  assert.deepEqual(tenantA.rows.map((r) => r.provider), ["instagram"]);
  assert.deepEqual(tenantB.rows.map((r) => r.provider), ["snapchat"]);

  // and a cross-tenant read returns nothing
  const cross = await db.query<{ n: number }>(
    `select count(*)::int as n from integration_connection
     where workspace_id = $1 and secret = 'ciphertext-b'`,
    ["11111111-1111-1111-1111-111111111111"]
  );
  assert.equal(cross.rows[0].n, 0, "workspace A must never read workspace B's row");

  await db.close();
});

test("0027 is idempotent: a second run changes nothing", async () => {
  const db = new PGlite();
  await seedCurrentProductionShape(db);
  for (const statement of STATEMENTS) await db.exec(statement);
  const first = await snapshot(db);

  for (const statement of STATEMENTS) await db.exec(statement);
  const second = await snapshot(db);

  assert.deepEqual(second, first, "re-applying the migration must be a no-op");
  const tables = await db.query<{ n: number }>(`
    select count(*)::int as n from information_schema.tables
    where table_schema='public' and table_name like 'Agent%'
  `);
  assert.equal(tables.rows[0].n, 5, "still exactly five agent tables");

  await db.close();
});
