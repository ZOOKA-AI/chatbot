import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * runAction is the one place a customer's request becomes an agent task.
 *
 * These tests are about the order of its refusals: nothing is created unless the action exists,
 * the input matches the contract, the project is the caller's, an assigned agent holds the tool,
 * and the workspace has allowance left. Duplicate submissions are also here, because a
 * double-clicked button must not queue the same work twice.
 */

const holder = vi.hoisted(() => ({
  project: null as null | Record<string, unknown>,
  agent: null as null | Record<string, unknown>,
  tasks: [] as Array<Record<string, unknown>>,
  billing: { subscription: { plan: "pro" }, usage: { agentRuns: 0 } } as Record<string, unknown>,
  created: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  getWorkspaceBilling: async () => holder.billing,
}));
vi.mock("@/lib/projects/store", () => ({
  getProject: async () => holder.project,
  getProjectByName: async () => holder.project,
  listProjectTasks: async () => holder.tasks,
  resolveProjectAgentForTool: async () => holder.agent,
}));
vi.mock("@/lib/agents/command-center", () => ({
  createTask: async (input: Record<string, unknown>) => {
    holder.created.push(input);
    return { id: "task-1", status: "pending" };
  },
}));

const { runAction } = await import("@/lib/actions/run");

const project = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha", status: "active" };
const agent = {
  id: "22222222-2222-4222-8222-222222222222",
  displayName: "Vera",
  slug: "vera",
  role: "researcher",
  status: "active",
  allowedTools: ["github_repo_inspect"],
};

beforeEach(() => {
  holder.project = project;
  holder.agent = agent;
  holder.tasks = [];
  holder.billing = { subscription: { plan: "pro" }, usage: { agentRuns: 0 } };
  holder.created = [];
});

const run = (overrides: Record<string, unknown> = {}) =>
  runAction({
    organizationId: "org-a",
    actionId: "repo_health_report",
    projectId: project.id,
    inputs: { repo: "ZOOKA-AI/chatbot" },
    ...overrides,
  });

describe("refusals come before any task exists", () => {
  test("an unknown action is a 404 and creates nothing", async () => {
    const result = await run({ actionId: "does_not_exist" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 404);
    assert.equal(holder.created.length, 0);
  });

  test("missing input is refused with the field named", async () => {
    const result = await run({ inputs: {} });
    assert.equal(result.ok === false && result.error, "missing_repo");
    assert.equal(result.ok === false && result.status, 400);
    assert.equal(holder.created.length, 0);
  });

  test("a project is required so the work has an owner", async () => {
    const result = await run({ projectId: undefined, projectName: undefined });
    assert.equal(result.ok === false && result.error, "project_required");
    assert.equal(holder.created.length, 0);
  });

  test("an archived project refuses new work", async () => {
    holder.project = { ...project, status: "archived" };
    const result = await run();
    assert.equal(result.ok === false && result.error, "project_archived");
    assert.equal(holder.created.length, 0);
  });

  test("no agent on the project means no run, and the reason says how to fix it", async () => {
    holder.agent = null;
    const result = await run();
    assert.equal(result.ok === false && result.error, "no_assigned_agent");
    assert.match(String((result as { detail?: string }).detail), /Assign an agent/);
    assert.equal(holder.created.length, 0);
  });

  test("an agent without the tool is refused even though it is assigned", async () => {
    holder.agent = { ...agent, allowedTools: ["vercel_deployment_inspect"] };
    const result = await run();
    assert.equal(result.ok === false && result.error, "tool_not_assigned");
    assert.equal(holder.created.length, 0);
  });

  test("a plan without agent runs cannot spend them", async () => {
    holder.billing = { subscription: { plan: "free" }, usage: { agentRuns: 0 } };
    const result = await run();
    assert.equal(result.ok === false && result.error, "plan_does_not_include_agent_runs");
    assert.equal(holder.created.length, 0);
  });

  test("an exhausted allowance refuses before a task is written", async () => {
    holder.billing = { subscription: { plan: "pro" }, usage: { agentRuns: 1_000_000 } };
    const result = await run();
    assert.equal(result.ok === false && result.error, "run_allowance_exhausted");
    assert.equal(holder.created.length, 0);
  });
});

describe("an accepted run becomes a real task with everything the worker needs", () => {
  test("the task carries the project, the agent, the tool and the inputs", async () => {
    const result = await run();
    assert.equal(result.ok, true);
    assert.equal(holder.created.length, 1);

    const created = holder.created[0] as {
      projectId: string;
      ownerAgentId: string;
      payload: Record<string, unknown>;
      approvalRequired: boolean;
    };
    assert.equal(created.projectId, project.id);
    assert.equal(created.ownerAgentId, agent.id);
    assert.equal(created.payload.tool, "github_repo_inspect");
    assert.equal(created.payload.actionId, "repo_health_report");
    assert.deepEqual(created.payload.inputs, { repo: "ZOOKA-AI/chatbot" });
    assert.equal(created.payload.repo, "ZOOKA-AI/chatbot");
    assert.equal(created.approvalRequired, false);
  });

  test("the response reports the stored state rather than implying completion", async () => {
    const result = await run();
    assert.equal(result.ok === true && result.status, "pending");
    assert.equal(result.ok === true && result.deduplicated, false);
  });
});

describe("a duplicate submission is the same task", () => {
  test("an identical request inside the window returns the queued task", async () => {
    holder.tasks = [
      {
        id: "existing-task",
        status: "pending",
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        payload: { actionId: "repo_health_report", inputs: { repo: "ZOOKA-AI/chatbot" } },
      },
    ];
    const result = await run();
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.taskId, "existing-task");
    assert.equal(result.ok === true && result.deduplicated, true);
    assert.equal(holder.created.length, 0);
  });

  test("different inputs are different work", async () => {
    holder.tasks = [
      {
        id: "existing-task",
        status: "pending",
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        payload: { actionId: "repo_health_report", inputs: { repo: "ZOOKA-AI/other" } },
      },
    ];
    const result = await run();
    assert.equal(result.ok === true && result.deduplicated, false);
    assert.equal(holder.created.length, 1);
  });

  test("an old identical task does not block a deliberate re-run", async () => {
    holder.tasks = [
      {
        id: "old-task",
        status: "pending",
        approvalRequired: false,
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        payload: { actionId: "repo_health_report", inputs: { repo: "ZOOKA-AI/chatbot" } },
      },
    ];
    const result = await run();
    assert.equal(result.ok === true && result.deduplicated, false);
    assert.equal(holder.created.length, 1);
  });

  test("a finished task is not reused", async () => {
    holder.tasks = [
      {
        id: "done-task",
        status: "completed",
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        payload: { actionId: "repo_health_report", inputs: { repo: "ZOOKA-AI/chatbot" } },
      },
    ];
    const result = await run();
    assert.equal(result.ok === true && result.deduplicated, false);
  });
});
