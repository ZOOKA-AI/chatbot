import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * Who decides the inputs a tool runs with.
 *
 * The route passes exactly what the caller sent; the worker fills in the task's own payload when
 * the caller sent none. That split matters because the action catalog stores the inputs on the
 * task, and a worker claiming the queue has no other way to know them. Before the fix the tool
 * ran on an empty payload and reported "malformed repository name" instead of reading the repo
 * the customer had chosen.
 */

const holder = vi.hoisted(() => ({
  runs: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/commander-scope", () => ({ withCommanderTenant: <T,>(handler: T) => handler }));
vi.mock("@/lib/agents/command-center", () => ({
  authenticateAgent: async () => ({
    id: "agent-1",
    organizationId: "org-a",
    allowedTools: ["github_repo_inspect"],
    status: "active",
  }),
  listTasks: async () => [
    { id: "22222222-2222-4222-8222-222222222222", payload: { repo: "ZOOKA-AI/chatbot" } },
  ],
}));
vi.mock("@/lib/agents/worker", () => ({
  WORKER_TOOLS: { github_repo_inspect: {}, vercel_deployment_inspect: {} },
  runTask: async (_agent: unknown, input: Record<string, unknown>) => {
    holder.runs.push(input);
    return { ok: true, taskId: input.taskId, status: "completed", tool: input.tool };
  },
  executionReport: async () => [],
}));
vi.mock("@/lib/validation/api", () => ({
  validateJson: async (request: Request) => ({ ok: true, data: await request.json() }),
}));

const { POST } = await import("@/app/api/agents/worker/route");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/agents/worker", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer zk_test" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  holder.runs = [];
});

describe("the route never invents a payload", () => {
  test("a caller that sends no payload passes none, leaving the task to decide", async () => {
    const response = await post({ tool: "github_repo_inspect" });
    assert.equal(response.status, 200);
    assert.equal(holder.runs.length, 1);
    assert.equal(holder.runs[0].payload, undefined);
    // The claim path still resolved a real task id rather than running an unowned task.
    assert.equal(holder.runs[0].taskId, "22222222-2222-4222-8222-222222222222");
  });

  test("an explicit payload is passed through untouched", async () => {
    await post({ tool: "github_repo_inspect", payload: { repo: "ZOOKA-AI/other" } });
    assert.deepEqual(holder.runs[0].payload, { repo: "ZOOKA-AI/other" });
  });

  test("an empty queue runs nothing and says so", async () => {
    const mod = await import("@/lib/agents/command-center");
    const spy = vi.spyOn(mod, "listTasks").mockResolvedValueOnce([] as never);
    const response = await post({ tool: "github_repo_inspect" });
    const body = await response.json();
    assert.equal(body.ran, false);
    assert.equal(body.reason, "queue_empty");
    assert.equal(holder.runs.length, 0);
    spy.mockRestore();
  });
});
