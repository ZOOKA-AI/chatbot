import assert from "node:assert/strict";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));

import { createCommanderTools } from "@/lib/ai/tools/commander";

/**
 * The bridge's contract, checked without a database.
 *
 * What matters here is not that a task can be created, but that the toolset
 * gives the model no way to claim work happened: no completion tool exists, and
 * every reply carries the database's own status.
 */

const created: unknown[] = [];
const rows: Record<string, unknown>[] = [];

vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderScope: async (_organizationId: string, work: () => Promise<unknown>) => work(),
}));

vi.mock("@/lib/agents/worker", () => ({
  executionReport: async (_organizationId: string, taskId: string) => ({
    tool: "github_repo_inspect",
    attempt: 1,
    status: rows.some((r) => r.id === taskId) ? "succeeded" : "failed",
    evidenceRef: `execution:test-${taskId}`,
    resultSummary: "ok",
    error: null,
  }),
}));

vi.mock("@/lib/agents/command-center", () => ({
  createTask: async (input: Record<string, unknown>) => {
    created.push(input);
    const task = {
      id: "0b7f0c74-7f1e-4a0e-9c1a-6d0a1f3c9e21",
      status: "pending",
      approvalRequired: Boolean(input.approvalRequired),
      ...input,
    };
    rows.push(task);
    return task;
  },
  getTask: async (input: { organizationId: string; taskId: string }) => {
    const row = rows.find((r) => r.id === input.taskId);
    return row && row.organizationId === input.organizationId ? row : null;
  },
  listTasks: async () => rows,
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const tools = (canManage = true) =>
  createCommanderTools({ organizationId: ORG, userId: "user-alpha-1", canManage });

describe("the bridge offers no way to fake completion", () => {
  test("the toolset has exactly three tools, none of which writes a result", () => {
    assert.deepEqual(Object.keys(tools()).sort(), [
      "createExecutionTask",
      "getExecutionStatus",
      "listExecutionTasks",
    ]);
    const names = Object.keys(tools()).join(" ");
    assert.doesNotMatch(names, /complete|report|approve|reject|decide|finish/i);
  });

  test("creating a task returns pending and says so in words", async () => {
    const result = (await tools().createExecutionTask.execute!(
      { title: "Run the test suite", instruction: "Run the full suite and report failures" },
      { toolCallId: "c1", messages: [] } as never
    )) as Record<string, unknown>;

    assert.equal(result.ok, true);
    assert.equal(result.status, "pending");
    assert.match(String(result.note), /No agent has run it yet/);
    const last = created.at(-1) as { organizationId: string; createdBy: string };
    assert.equal(last.organizationId, ORG, "the tenant comes from the session");
    assert.equal(last.createdBy, `user:${"user-alpha-1".slice(0, 8)}`);
  });

  test("a gated task is described as gated, not as done", async () => {
    const result = (await tools().createExecutionTask.execute!(
      {
        title: "Deploy to production",
        instruction: "Deploy the current build to production",
        approvalRequired: true,
      },
      { toolCallId: "c2", messages: [] } as never
    )) as Record<string, unknown>;
    assert.match(String(result.note), /will not run until an owner or admin approves/);
  });

  test("a member cannot queue work, and is told why", async () => {
    const before = created.length;
    const result = (await tools(false).createExecutionTask.execute!(
      { title: "Delete the database", instruction: "Drop every table in production" },
      { toolCallId: "c3", messages: [] } as never
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.match(String(result.error), /owner or an admin/);
    assert.equal(created.length, before, "nothing was queued");
  });

  test("reading a missing task refuses to invent a status", async () => {
    const result = (await tools().getExecutionStatus.execute!(
      { taskId: "99999999-9999-4999-8999-999999999999" },
      { toolCallId: "c4", messages: [] } as never
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.match(String(result.error), /cannot find it/);
  });

  test("reading a queued task says plainly that it is not completed", async () => {
    const create = (await tools().createExecutionTask.execute!(
      { title: "Check the logs", instruction: "Read the last deployment logs" },
      { toolCallId: "c5", messages: [] } as never
    )) as Record<string, unknown>;
    const status = (await tools().getExecutionStatus.execute!(
      { taskId: create.taskId as string },
      { toolCallId: "c6", messages: [] } as never
    )) as Record<string, unknown>;
    assert.equal(status.status, "pending");
    assert.match(String(status.completion), /^Not completed/);
  });
});
