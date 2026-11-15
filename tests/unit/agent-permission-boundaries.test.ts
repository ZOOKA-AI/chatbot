import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

// The routes now import the tenant wrapper, which is server-only by design.
vi.mock("server-only", () => ({}));

/**
 * Permission boundaries for the Commander, at the route layer.
 *
 * The isolation suite proves the store cannot cross tenants. This file proves
 * the routes cannot be talked out of their own organisation, and that a valid
 * agent key does not become a human decision-maker:
 *
 *   - the organisation always comes from the resolved caller, never the body;
 *   - an agent key cannot cancel work or decide an approval;
 *   - an approval listing is always filtered to the caller's organisation.
 */

const mocks = vi.hoisted(() => ({
  caller: null as unknown,
  listApprovals: vi.fn(),
  decideApproval: vi.fn(),
  cancelTask: vi.fn(),
}));

vi.mock("@/lib/agents/auth", () => {
  const callerOrganizationId = (caller: { kind: string; organizationId?: string; agent?: { organizationId: string } }) =>
    caller.kind === "agent" ? caller.agent!.organizationId : caller.organizationId!;
  const canManage = (caller: { kind: string; role?: string }) =>
    caller.kind === "owner" && (caller.role === "owner" || caller.role === "admin");
  return {
    resolveCaller: async () => mocks.caller,
    callerOrganizationId,
    canManage,
    json: (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "cache-control": "no-store" } }),
    unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
    forbidden: (reason: string) => Response.json({ error: "forbidden", reason }, { status: 403 }),
    badRequest: (reason: string) => Response.json({ error: "bad_request", reason }, { status: 400 }),
  };
});

vi.mock("@/lib/agents/command-center", () => ({
  // The route now records a decision after a successful write, so the mock has to
  // expose it; its behaviour is asserted in approval-decisions.test.ts.
  recordDecision: vi.fn(),
  listApprovals: (...args: unknown[]) => mocks.listApprovals(...args),
  decideApproval: (...args: unknown[]) => mocks.decideApproval(...args),
  cancelTask: (...args: unknown[]) => mocks.cancelTask(...args),
}));

const APPROVAL_ID = "11111111-2222-4333-8444-555555555555";
const TASK_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const OWNER = { kind: "owner", userId: "user-alpha-1", organizationId: "org-alpha", role: "owner" };
const MEMBER = { kind: "owner", userId: "user-alpha-2", organizationId: "org-alpha", role: "member" };
const AGENT = {
  kind: "agent",
  agent: {
    id: "agent-alpha",
    organizationId: "org-alpha",
    scopes: ["task:claim", "task:report", "approval:request"],
    status: "active",
  },
};

function post(path: string, body: unknown) {
  return new Request(`https://zooka.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.caller = OWNER;
  mocks.listApprovals.mockReset().mockResolvedValue([]);
  mocks.decideApproval.mockReset().mockResolvedValue({ id: APPROVAL_ID, status: "approved" });
  mocks.cancelTask.mockReset().mockResolvedValue({ id: TASK_ID, status: "cancelled" });
});

describe("deciding an approval", () => {
  test("an agent key is refused, so an agent cannot approve its own request", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(post(`/api/agents/approvals/${APPROVAL_ID}`, { decision: "approved" }), params(APPROVAL_ID));

    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, "owner_or_admin_required");
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("a plain member cannot decide either", async () => {
    mocks.caller = MEMBER;
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(post(`/api/agents/approvals/${APPROVAL_ID}`, { decision: "approved" }), params(APPROVAL_ID));
    assert.equal(response.status, 403);
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("an owner decides inside their own organisation, whatever the body claims", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(
      post(`/api/agents/approvals/${APPROVAL_ID}`, {
        decision: "rejected",
        organizationId: "org-victim",
      }),
      params(APPROVAL_ID)
    );

    // The unexpected field is refused outright rather than silently ignored.
    assert.equal(response.status, 400);
    assert.equal((await response.json()).reason, "invalid_body");
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("a valid decision carries the caller's organisation and the decider's id", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(post(`/api/agents/approvals/${APPROVAL_ID}`, { decision: "approved" }), params(APPROVAL_ID));

    assert.equal(response.status, 200);
    const [args] = mocks.decideApproval.mock.calls[0];
    assert.equal(args.organizationId, "org-alpha");
    assert.equal(args.approvalId, APPROVAL_ID);
    assert.equal(args.decision, "approved");
    assert.match(args.decidedBy, /^owner:/);
  });

  test("an approval that is not the caller's, or already decided, answers 404", async () => {
    mocks.decideApproval.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(post(`/api/agents/approvals/${APPROVAL_ID}`, { decision: "approved" }), params(APPROVAL_ID));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });

  test("a malformed id or an unknown decision is refused before any write", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const bad = await POST(post("/api/agents/approvals/not-a-uuid", { decision: "approved" }), params("not-a-uuid"));
    assert.equal(bad.status, 400);

    const wrong = await POST(post(`/api/agents/approvals/${APPROVAL_ID}`, { decision: "maybe" }), params(APPROVAL_ID));
    assert.equal(wrong.status, 400);

    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("listing approvals cannot be pointed at another organisation", async () => {
    const { GET } = await import("@/app/api/agents/approvals/route");
    const response = await GET(
      new Request(`https://zooka.test/api/agents/approvals?organizationId=org-victim`)
    );
    assert.equal(response.status, 400, "an unknown query key is refused, not ignored");

    const ok = await GET(new Request("https://zooka.test/api/agents/approvals?status=pending"));
    assert.equal(ok.status, 200);
    const [orgId] = mocks.listApprovals.mock.calls[0];
    assert.equal(orgId, "org-alpha");
  });
});

describe("cancelling a task", () => {
  test("an agent key cannot cancel work", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/tasks/[id]/route");
    const response = await POST(post(`/api/agents/tasks/${TASK_ID}`, { reason: "stop it" }), params(TASK_ID));
    assert.equal(response.status, 403);
    assert.equal(mocks.cancelTask.mock.calls.length, 0);
  });

  test("a cancellation is scoped to the caller's organisation", async () => {
    const { POST } = await import("@/app/api/agents/tasks/[id]/route");
    const response = await POST(post(`/api/agents/tasks/${TASK_ID}`, { reason: "no longer needed" }), params(TASK_ID));
    assert.equal(response.status, 200);
    const [args] = mocks.cancelTask.mock.calls[0];
    assert.equal(args.organizationId, "org-alpha");
    assert.equal(args.taskId, TASK_ID);
  });

  test("another tenant's task answers 404, never 'forbidden'", async () => {
    mocks.cancelTask.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/tasks/[id]/route");
    const response = await POST(post(`/api/agents/tasks/${TASK_ID}`, { reason: "try me" }), params(TASK_ID));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });
});
