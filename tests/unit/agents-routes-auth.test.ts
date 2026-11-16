import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

/**
 * The /api/agents/* surface, tested at the route boundary against the isolated
 * database's contracts (no production call). These tests pin the rules that make
 * the command centre safe: nothing is readable without a caller, only an owner or
 * admin may enqueue work, and only an agent holding approval:request may ask for
 * a human decision.
 */
const { h } = vi.hoisted(() => ({
  h: {
    authenticateAgent: vi.fn(),
    hasScope: vi.fn(),
    requestApproval: vi.fn(),
    createTask: vi.fn(),
    listTasks: vi.fn(),
    commandCenterStatus: vi.fn(),
    recentAgentActivity: vi.fn(),
    listDecisions: vi.fn(),
    getWorkspaceContext: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/command-center", () => ({
  authenticateAgent: h.authenticateAgent,
  hasScope: h.hasScope,
  requestApproval: h.requestApproval,
  createTask: h.createTask,
  listTasks: h.listTasks,
  commandCenterStatus: h.commandCenterStatus,
  recentAgentActivity: h.recentAgentActivity,
  listDecisions: h.listDecisions,
}));
vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: h.getWorkspaceContext,
}));

import { GET as statusGET } from "@/app/api/agents/status/route";
import { GET as tasksGET, POST as tasksPOST } from "@/app/api/agents/tasks/route";
import { POST as approvalPOST } from "@/app/api/agents/approvals/request/route";
import { GET as decisionsGET } from "@/app/api/agents/decisions/route";

const agent = { id: "agent-1", slug: "builder", scopes: ["approval:request"] };
const owner = { user: { id: "user-owner-1" }, organizationId: "org-1", role: "owner" };
const viewer = { user: { id: "user-viewer-1" }, organizationId: "org-1", role: "member" };

function req(body?: unknown) {
  return new Request("https://zooka-ai.com/api/agents/tasks", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  h.authenticateAgent.mockResolvedValue(null);
  h.getWorkspaceContext.mockResolvedValue(null);
});

test("nothing is readable without a caller", async () => {
  assert.equal((await statusGET(req())).status, 401);
  assert.equal((await tasksGET(req())).status, 401);
  assert.equal((await decisionsGET(req())).status, 401);
});

test("an authenticated agent sees the command centre status", async () => {
  h.authenticateAgent.mockResolvedValue(agent);
  h.commandCenterStatus.mockResolvedValue({ pendingApprovals: 2, openTasks: 5 });
  h.recentAgentActivity.mockResolvedValue([]);

  const response = await statusGET(req());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pendingApprovals, 2);
  assert.equal(body.openTasks, 5);
  assert.deepEqual(body.recent, []);
});

test("reading the task queue is allowed for a signed-in member", async () => {
  h.getWorkspaceContext.mockResolvedValue(viewer);
  h.listTasks.mockResolvedValue([{ id: "t1" }]);

  const response = await tasksGET(req());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tasks: [{ id: "t1" }] });
});

test("only an owner or admin may enqueue work", async () => {
  h.getWorkspaceContext.mockResolvedValue(viewer);
  const denied = await tasksPOST(
    req({ title: "do", instruction: "something" })
  );
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).reason, "owner_or_admin_required");
  assert.equal(h.createTask.mock.calls.length, 0, "must not write for a member");

  h.getWorkspaceContext.mockResolvedValue(owner);
  h.createTask.mockResolvedValue({ id: "task-created" });
  const created = await tasksPOST(
    req({ title: "do", instruction: "something", priority: "high" })
  );
  assert.equal(created.status, 201);
  assert.equal((await created.json()).task.id, "task-created");
  const args = h.createTask.mock.calls[0][0];
  assert.equal(args.priority, "high");
  assert.equal(args.approvalRequired, false);
  assert.match(args.createdBy, /^owner:/);
});

test("a human cannot request an approval; an agent without the scope cannot either", async () => {
  h.getWorkspaceContext.mockResolvedValue(owner);
  const asHuman = await approvalPOST(req({ reason: "spend AED 50" }));
  assert.equal(asHuman.status, 403);
  assert.equal((await asHuman.json()).reason, "agent_key_required");

  vi.clearAllMocks();
  h.getWorkspaceContext.mockResolvedValue(null);
  h.authenticateAgent.mockResolvedValue(agent);
  h.hasScope.mockReturnValue(false);
  const noScope = await approvalPOST(req({ reason: "spend AED 50" }));
  assert.equal(noScope.status, 403);
  assert.equal((await noScope.json()).reason, "missing_scope:approval:request");
});

test("an approval request needs a reason and lands pending the owner", async () => {
  h.authenticateAgent.mockResolvedValue(agent);
  h.hasScope.mockReturnValue(true);

  const noReason = await approvalPOST(req({}));
  assert.equal(noReason.status, 400);
  assert.equal((await noReason.json()).reason, "reason_required");

  h.requestApproval.mockResolvedValue({ id: "approval-1", status: "pending" });
  const ok = await approvalPOST(req({ reason: "spend AED 50", taskId: "3f1c2b4a-5d6e-4f70-8a91-0b2c3d4e5f60" }));
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.equal(body.status, "pending_owner_decision");
  assert.equal(body.approval.id, "approval-1");
  assert.equal(
    h.requestApproval.mock.calls[0][1].taskId,
    "3f1c2b4a-5d6e-4f70-8a91-0b2c3d4e5f60"
  );
});
