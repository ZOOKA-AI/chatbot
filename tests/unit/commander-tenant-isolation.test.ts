import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, test, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Cross-tenant isolation for the agent command center, on a real PostgreSQL
 * engine (PGlite) against the real schema and the real query functions.
 *
 * This exists because the tables were created without an organisation column,
 * so listTasks/listDecisions/listDeployments/listAgents read the whole table and
 * claimTask would hand any pending task to any agent that asked first. The tests
 * below are the four questions that matter:
 *
 *   can B see A's rows?              no
 *   can B claim A's task?            no
 *   can B report on A's task?        no
 *   does a valid key widen scope?    no, it is pinned to its organisation
 */

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("server-only", () => ({}));

const CENTER = "@/lib/agents/command-center";
let center: typeof import("@/lib/agents/command-center");
let pg: PGlite;

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

function sqlFile(name: string) {
  return readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
}

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await apply(sqlFile("0027_agent_command_center.sql"));
  await apply(sqlFile("pending/0028_agent_tenant_scope.sql"));
  holder.db = drizzle(pg, { schema });
  center = (await import(CENTER)) as typeof import("@/lib/agents/command-center");
});

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  for (const table of [
    "AgentApproval",
    "AgentDecision",
    "AgentDeployment",
    "AgentTask",
    "AgentIdentity",
  ]) {
    await pg.exec(`delete from "${table}"`);
  }
});

async function register(organizationId: string, slug: string) {
  return center.registerAgent({
    organizationId,
    slug,
    displayName: `${slug} agent`,
    role: "worker",
  });
}

function bearer(key: string) {
  return new Request("https://zooka.test/api/agents/status", {
    headers: { authorization: `Bearer ${key}` },
  });
}

test("the migration is idempotent and fails loudly if a table is left unscoped", async () => {
  const columns = await pg.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema='public' and column_name='organizationId'
       and table_name in ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')`
  );
  assert.equal(columns.rows.length, 5);
  await apply(sqlFile("pending/0028_agent_tenant_scope.sql"));
});

test("a valid agent key is pinned to its own organisation", async () => {
  const a = await register(ORG_A, "alpha-worker");
  const resolved = await center.authenticateAgent(bearer(a.key));
  assert.ok(resolved);
  assert.equal(resolved.organizationId, ORG_A, "the key carries the organisation, nothing else");

  const stranger = await center.authenticateAgent(bearer("zk_not_a_real_key"));
  assert.equal(stranger, null);
});

test("B cannot list A's tasks, and A still sees its own", async () => {
  const a = await register(ORG_A, "alpha-worker");
  const b = await register(ORG_B, "beta-worker");
  await center.createTask({
    organizationId: ORG_A,
    title: "deploy the alpha service",
    instruction: "only alpha may see this",
  });
  await center.createTask({
    organizationId: ORG_B,
    title: "beta housekeeping",
    instruction: "beta only",
  });

  const forA = await center.listTasks({ organizationId: ORG_A });
  const forB = await center.listTasks({ organizationId: ORG_B });
  assert.deepEqual(forA.map((t) => t.title), ["deploy the alpha service"]);
  assert.deepEqual(forB.map((t) => t.title), ["beta housekeeping"]);

  // available=true is the cross-workspace hole in its worst form: it returns
  // every unowned pending task.
  const availableToB = await center.listTasks({ organizationId: ORG_B, available: true });
  assert.equal(availableToB.length, 1);
  assert.equal(availableToB[0].organizationId, ORG_B);

  assert.ok(a.agent.id !== b.agent.id);
});

test("B cannot claim A's task, even though it is pending and unowned", async () => {
  await register(ORG_A, "alpha-worker");
  const b = await register(ORG_B, "beta-worker");
  const task = await center.createTask({
    organizationId: ORG_A,
    title: "production change",
    instruction: "alpha only",
  });

  const bIdentity = (await center.authenticateAgent(bearer(b.key)))!;
  const attempt = await center.claimTask(bIdentity, task.id);
  assert.equal(attempt.ok, false);
  assert.equal(
    attempt.ok === false ? attempt.error : "",
    "task_not_found",
    "from beta the task does not exist, which discloses nothing"
  );

  const [stillPending] = await center.listTasks({ organizationId: ORG_A });
  assert.equal(stillPending.status, "pending", "the claim changed nothing");

  const a = await register(ORG_A, "alpha-worker-2");
  const aIdentity = (await center.authenticateAgent(bearer(a.key)))!;
  const own = await center.claimTask(aIdentity, task.id);
  assert.equal(own.ok, true, "the owning workspace can still claim it");
});

test("B cannot report on A's task, and cannot see it through the list", async () => {
  const a = await register(ORG_A, "alpha-worker");
  const b = await register(ORG_B, "beta-worker");
  const task = await center.createTask({
    organizationId: ORG_A,
    title: "scoped task",
    instruction: "alpha only",
  });
  const aIdentity = (await center.authenticateAgent(bearer(a.key)))!;
  await center.claimTask(aIdentity, task.id);

  const bIdentity = (await center.authenticateAgent(bearer(b.key)))!;
  const crossed = await center.reportTask(bIdentity, {
    taskId: task.id,
    status: "completed",
    evidence: "beta says this is done",
  });
  assert.equal(crossed, null, "no row updated across the boundary");

  const correct = await center.reportTask(aIdentity, {
    taskId: task.id,
    status: "completed",
    evidence: "alpha finished it",
  });
  assert.ok(correct);
  assert.equal(correct.status, "completed");
});

test("decisions, deployments, approvals and the status board are per organisation", async () => {
  const a = await register(ORG_A, "alpha-worker");
  const b = await register(ORG_B, "beta-worker");
  const aIdentity = (await center.authenticateAgent(bearer(a.key)))!;
  const bIdentity = (await center.authenticateAgent(bearer(b.key)))!;

  await center.recordDecision(aIdentity, {
    organizationId: ORG_A,
    title: "alpha decision",
    body: "alpha body",
  });
  await center.recordDecision(null, {
    organizationId: ORG_B,
    title: "beta decision",
    body: "beta body",
  });
  await center.recordDeployment(aIdentity, {
    organizationId: ORG_A,
    environment: "production",
    status: "succeeded",
  });
  const taskA = await center.createTask({
    organizationId: ORG_A,
    title: "needs approval",
    instruction: "alpha only",
  });
  await center.requestApproval(aIdentity, {
    organizationId: ORG_A,
    taskId: taskA.id,
    reason: "alpha wants permission",
  });

  assert.deepEqual((await center.listDecisions(ORG_A)).map((d) => d.title), ["alpha decision"]);
  assert.deepEqual((await center.listDecisions(ORG_B)).map((d) => d.title), ["beta decision"]);
  assert.equal((await center.listDeployments(ORG_A)).length, 1);
  assert.equal((await center.listDeployments(ORG_B)).length, 0);
  assert.equal((await center.listAgents(ORG_A)).length, 1);
  assert.equal((await center.listAgents(ORG_B)).length, 1);

  const statusA = await center.commandCenterStatus(ORG_A);
  const statusB = await center.commandCenterStatus(ORG_B);
  assert.equal(statusA.agents.total, 1);
  assert.equal(statusA.pendingApprovals, 1);
  assert.equal(statusB.pendingApprovals, 0, "beta does not see alpha's approval request");
  assert.equal(statusB.tasks.pending ?? 0, 0);

  assert.equal(bIdentity.organizationId, ORG_B);
});

test("a row left at the migration default is visible to nobody", async () => {
  const a = await register(ORG_A, "alpha-worker");
  await pg.exec(
    `insert into "AgentTask" ("id","title","instruction") values (gen_random_uuid(),'legacy row','from before the scope')`
  );
  const tasks = await center.listTasks({ organizationId: ORG_A });
  assert.deepEqual(tasks.map((t) => t.title), [], "unclaimed rows are not served to any workspace");
  const status = await center.commandCenterStatus(ORG_A);
  assert.equal(status.tasks.pending, undefined, "and they are not counted either");
  assert.ok(a.key.startsWith("zk_"));
});
