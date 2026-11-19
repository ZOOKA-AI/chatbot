import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * Tool authorization on the real worker route.
 *
 * These tests exist because a restricted agent is only restricted if the refusal happens
 * before the task is claimed. A check after claiming would already have moved a row out of
 * the queue and assigned it to an agent that was never allowed to run it.
 */

const holder = vi.hoisted(() => ({
  agent: null as null | Record<string, unknown>,
  claimed: [] as string[],
  ran: [] as string[],
  listCalls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderTenant: <T,>(handler: T) => handler,
}));
vi.mock("@/lib/agents/command-center", () => ({
  authenticateAgent: async () => holder.agent,
  listTasks: async () => {
    holder.listCalls += 1;
    return [{ id: "11111111-1111-4111-8111-111111111111", title: "queued work", status: "pending" }];
  },
}));
vi.mock("@/lib/agents/worker", () => ({
  // The route derives its accepted tool enum from this map, so the mock must carry the same
  // shape the real module does; otherwise the schema would be built from undefined.
  WORKER_TOOLS: {
    github_repo_inspect: { name: "github_repo_inspect" },
    vercel_deployment_inspect: { name: "vercel_deployment_inspect" },
  },
  runTask: async (_agent: unknown, input: { taskId: string; tool: string }) => {
    holder.claimed.push(input.taskId);
    holder.ran.push(input.tool);
    return { ok: true, taskId: input.taskId, executionId: "e1", status: "completed", tool: input.tool };
  },
  executionReport: async () => ({ steps: [] }),
}));

import { POST } from "@/app/api/agents/worker/route";

const post = (body: unknown) =>
  new Request("https://zooka-ai.com/api/agents/worker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const baseAgent = {
  id: "agent-1",
  organizationId: "org-a",
  status: "active",
  scopes: ["task:claim"],
  environment: "production",
};

beforeEach(() => {
  holder.agent = { ...baseAgent, allowedTools: null };
  holder.claimed = [];
  holder.ran = [];
  holder.listCalls = 0;
});

describe("an assigned tool runs", () => {
  test("an unrestricted agent may run any implemented tool", async () => {
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 200);
    assert.deepEqual(holder.ran, ["github_repo_inspect"]);
  });

  test("an agent assigned that tool may run it", async () => {
    holder.agent = { ...baseAgent, allowedTools: ["github_repo_inspect"] };
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 200);
    assert.deepEqual(holder.ran, ["github_repo_inspect"]);
  });
});

describe("a tool the agent was not given is refused before any claim", () => {
  test("the route answers 403 with a reason the owner can act on", async () => {
    holder.agent = { ...baseAgent, allowedTools: ["vercel_deployment_inspect"] };
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "tool_not_assigned");
    assert.equal(body.tool, "github_repo_inspect");
    assert.match(body.detail, /assign/i);
  });

  test("nothing is claimed, and no tool runs", async () => {
    holder.agent = { ...baseAgent, allowedTools: ["vercel_deployment_inspect"] };
    await POST(post({ tool: "github_repo_inspect" }));
    // The refusal comes first, so the queue is never touched.
    assert.equal(holder.listCalls, 0);
    assert.deepEqual(holder.claimed, []);
    assert.deepEqual(holder.ran, []);
  });
});

describe("a malformed stored permission fails closed", () => {
  test("a string instead of an array refuses the tool", async () => {
    holder.agent = { ...baseAgent, allowedTools: "github_repo_inspect" };
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 403);
    assert.deepEqual(holder.ran, []);
  });

  test("an empty array refuses everything", async () => {
    holder.agent = { ...baseAgent, allowedTools: [] };
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 403);
  });
});

describe("the tool must exist", () => {
  test("an unimplemented tool is refused by schema, not attempted", async () => {
    holder.agent = { ...baseAgent, allowedTools: null };
    const response = await POST(post({ tool: "shell_exec" }));
    assert.equal(response.status, 400);
    assert.deepEqual(holder.ran, []);
  });
});

describe("authentication still comes first", () => {
  test("no agent means 401 and no claim", async () => {
    holder.agent = null;
    const response = await POST(post({ tool: "github_repo_inspect" }));
    assert.equal(response.status, 401);
    assert.equal(holder.listCalls, 0);
  });
});
