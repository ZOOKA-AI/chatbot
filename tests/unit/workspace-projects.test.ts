import assert from "node:assert/strict";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";

// The store reaches the database through the shared handle; a real client is injected so these
// assertions run on PostgreSQL rather than on a stand-in.
const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

/**
 * Workspace projects against real PostgreSQL.
 *
 * The point of these tests is the boundary: a project belongs to one workspace, and everything
 * attached to it — agents, tasks, executions — is read through that membership. A second
 * workspace must not be able to see it, attach an agent to it, or find its work.
 */

const ADMIN_URL = process.env.ZOOKA_TEST_PG_ADMIN;
const ORG_A = "org-ws-a";
const ORG_B = "org-ws-b";

let sql: ReturnType<typeof postgres> | null = null;
let store: typeof import("@/lib/projects/store") | null = null;
let schema: typeof import("@/lib/db/schema") | null = null;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  process.env.DATABASE_URL = ADMIN_URL;
  sql = postgres(ADMIN_URL, { max: 2 });
  holder.db = drizzle(sql);
  store = await import("@/lib/projects/store");
  schema = await import("@/lib/db/schema");
});

afterAll(async () => {
  if (sql) {
    await sql`delete from "AgentExecution" where "organizationId" in (${ORG_A}, ${ORG_B})`;
    await sql`delete from "AgentTask" where "organizationId" in (${ORG_A}, ${ORG_B})`;
    await sql`delete from "AgentSchedule" where "organizationId" in (${ORG_A}, ${ORG_B})`;
    await sql`delete from "AgentIdentity" where "organizationId" in (${ORG_A}, ${ORG_B})`;
    await sql`delete from "AgentProject" where "organizationId" in (${ORG_A}, ${ORG_B})`;
    await sql.end({ timeout: 5 });
  }
});

beforeEach(async () => {
  if (!sql) return;
  await sql`delete from "AgentExecution" where "organizationId" in (${ORG_A}, ${ORG_B})`;
  await sql`delete from "AgentTask" where "organizationId" in (${ORG_A}, ${ORG_B})`;
  await sql`delete from "AgentSchedule" where "organizationId" in (${ORG_A}, ${ORG_B})`;
  await sql`delete from "AgentIdentity" where "organizationId" in (${ORG_A}, ${ORG_B})`;
  await sql`delete from "AgentProject" where "organizationId" in (${ORG_A}, ${ORG_B})`;
});

async function makeProject(organizationId: string, name: string) {
  const created = await store!.createProject({ organizationId, name });
  assert.equal(created.ok, true);
  return created.ok ? created.project : null;
}

async function makeAgent(organizationId: string, tools: string[] | null, status = "active") {
  const [row] = await sql!`
    insert into "AgentIdentity" ("organizationId","slug","displayName","role","keyHash","allowedTools","status")
    values (${organizationId}, ${`agent-${Math.random().toString(16).slice(2, 10)}`}, 'Vera', 'researcher',
            ${"0".repeat(64)}, ${tools === null ? null : JSON.stringify(tools)}::jsonb, ${status})
    returning id`;
  return row.id as string;
}

describe.skipIf(!ADMIN_URL)("projects are scoped to one workspace", () => {
  test("each workspace lists only its own projects", async () => {
    await makeProject(ORG_A, "Alpha");
    await makeProject(ORG_B, "Beta");

    const a = await store!.listProjects(ORG_A);
    const b = await store!.listProjects(ORG_B);
    assert.deepEqual(a.map((row) => row.name), ["Alpha"]);
    assert.deepEqual(b.map((row) => row.name), ["Beta"]);
  });

  test("another workspace's project reads as missing, not as forbidden", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    assert.equal(await store!.getProject({ organizationId: ORG_B, projectId: project!.id }), null);
    assert.ok(await store!.getProject({ organizationId: ORG_A, projectId: project!.id }));
  });

  test("the same name may exist in two workspaces but not twice in one", async () => {
    await makeProject(ORG_A, "Website");
    const second = await store!.createProject({ organizationId: ORG_A, name: "Website" });
    assert.equal(second.ok, false);
    assert.equal(second.ok === false && second.error, "name_taken");
    assert.equal((await store!.createProject({ organizationId: ORG_B, name: "Website" })).ok, true);
  });

  test("a name that is blank or too short is refused", async () => {
    assert.equal((await store!.createProject({ organizationId: ORG_A, name: " " })).ok, false);
    assert.equal((await store!.createProject({ organizationId: ORG_A, name: "a" })).ok, false);
  });
});

describe.skipIf(!ADMIN_URL)("editing and archiving", () => {
  test("a rename persists and is still unique", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    await makeProject(ORG_A, "Gamma");
    const renamed = await store!.updateProject({
      organizationId: ORG_A,
      projectId: project!.id,
      patch: { name: "Delta" },
    });
    assert.equal(renamed.ok, true);
    const clash = await store!.updateProject({
      organizationId: ORG_A,
      projectId: project!.id,
      patch: { name: "Gamma" },
    });
    assert.equal(clash.ok === false && clash.error, "name_taken");
  });

  test("an unknown status and an empty patch are both refused", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    assert.equal(
      (await store!.updateProject({ organizationId: ORG_A, projectId: project!.id, patch: { status: "exploded" } }))
        .ok,
      false
    );
    assert.equal((await store!.updateProject({ organizationId: ORG_A, projectId: project!.id, patch: {} })).ok, false);
  });

  test("editing another workspace's project is not found", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const result = await store!.updateProject({
      organizationId: ORG_B,
      projectId: project!.id,
      patch: { name: "Hijacked" },
    });
    assert.equal(result.ok === false && result.error, "not_found");
  });

  test("a project with no work is deleted outright", async () => {
    const project = await makeProject(ORG_A, "Ephemeral");
    const removed = await store!.deleteProject({ organizationId: ORG_A, projectId: project!.id });
    assert.equal(removed.ok === true && removed.mode, "deleted");
    assert.equal(await store!.getProject({ organizationId: ORG_A, projectId: project!.id }), null);
  });

  test("a project holding work is archived and the work survives", async () => {
    const project = await makeProject(ORG_A, "Busy");
    await sql!`insert into "AgentTask" ("organizationId","title","instruction","projectId","status")
               values (${ORG_A}, 'did work', 'instruction', ${project!.id}, 'completed')`;

    const removed = await store!.deleteProject({ organizationId: ORG_A, projectId: project!.id });
    assert.equal(removed.ok === true && removed.mode, "archived");
    assert.equal(removed.ok === true && removed.keptTasks, 1);

    const still = await store!.getProject({ organizationId: ORG_A, projectId: project!.id });
    assert.equal(still?.status, "archived");
    assert.equal((await store!.listProjectTasks({ organizationId: ORG_A, projectId: project!.id })).length, 1);
  });
});

describe.skipIf(!ADMIN_URL)("agents are attached explicitly and never across workspaces", () => {
  test("an agent from this workspace is assigned and listed", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const agentId = await makeAgent(ORG_A, ["github_repo_inspect"]);
    const assigned = await store!.assignAgent({ organizationId: ORG_A, projectId: project!.id, agentId });
    assert.equal(assigned.ok, true);
    const agents = await store!.listProjectAgents(ORG_A, project!.id);
    assert.deepEqual(agents.map((agent) => agent.id), [agentId]);
  });

  test("another workspace's agent cannot be attached", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const foreignAgent = await makeAgent(ORG_B, ["github_repo_inspect"]);
    const assigned = await store!.assignAgent({ organizationId: ORG_A, projectId: project!.id, agentId: foreignAgent });
    assert.equal(assigned.ok === false && assigned.error, "agent_not_found");
    assert.equal((await store!.listProjectAgents(ORG_A, project!.id)).length, 0);
  });

  test("the runnable agent is the one holding the tool", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const without = await makeAgent(ORG_A, ["vercel_deployment_inspect"]);
    const withTool = await makeAgent(ORG_A, ["github_repo_inspect"]);
    await store!.assignAgent({ organizationId: ORG_A, projectId: project!.id, agentId: without });
    await store!.assignAgent({ organizationId: ORG_A, projectId: project!.id, agentId: withTool });

    const resolved = await store!.resolveProjectAgentForTool({
      organizationId: ORG_A,
      projectId: project!.id,
      tool: "github_repo_inspect",
    });
    assert.equal(resolved?.id, withTool);
  });

  test("a disabled agent is never resolved for execution", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const disabled = await makeAgent(ORG_A, ["github_repo_inspect"], "disabled");
    await store!.assignAgent({ organizationId: ORG_A, projectId: project!.id, agentId: disabled });
    assert.equal(
      await store!.resolveProjectAgentForTool({
        organizationId: ORG_A,
        projectId: project!.id,
        tool: "github_repo_inspect",
      }),
      null
    );
  });

  test("an agent on no project is offered as unassigned", async () => {
    await makeProject(ORG_A, "Alpha");
    const idle = await makeAgent(ORG_A, []);
    const unassigned = await store!.listUnassignedAgents(ORG_A);
    assert.deepEqual(unassigned.map((agent) => agent.id), [idle]);
  });
});

describe.skipIf(!ADMIN_URL)("work rolls up to its project", () => {
  test("tasks and execution evidence are read through the project", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    const [task] = await sql!`
      insert into "AgentTask" ("organizationId","title","instruction","projectId","status")
      values (${ORG_A}, 'inspect repo', 'instruction', ${project!.id}, 'completed')
      returning id`;
    await sql!`
      insert into "AgentExecution" ("taskId","organizationId","agentId","tool","status","resultSummary")
      values (${task.id}, ${ORG_A}, null, 'github_repo_inspect', 'succeeded', 'branch main at abc123')`;

    const tasks = await store!.listProjectTasks({ organizationId: ORG_A, projectId: project!.id });
    assert.equal(tasks.length, 1);
    const executions = await store!.listProjectExecutions({ organizationId: ORG_A, projectId: project!.id });
    assert.equal(executions.length, 1);
    assert.equal(executions[0].resultSummary, 'branch main at abc123');
  });

  test("another workspace cannot read the work", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    await sql!`insert into "AgentTask" ("organizationId","title","instruction","projectId","status")
               values (${ORG_A}, 'inspect repo', 'instruction', ${project!.id}, 'completed')`;
    assert.equal((await store!.listProjectTasks({ organizationId: ORG_B, projectId: project!.id })).length, 0);
    assert.equal((await store!.listProjectExecutions({ organizationId: ORG_B, projectId: project!.id })).length, 0);
  });

  test("schedules attach to a project and stay out of other workspaces", async () => {
    const project = await makeProject(ORG_A, "Alpha");
    await sql!`
      insert into "AgentSchedule" ("organizationId","title","instruction","cronExpression","projectId")
      values (${ORG_A}, 'weekly report', 'instruction', '0 9 * * 1', ${project!.id})`;
    assert.equal((await store!.listProjectSchedules(ORG_A, project!.id)).length, 1);
    assert.equal((await store!.listProjectSchedules(ORG_B, project!.id)).length, 0);
  });
});
