import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Approval and rejection semantics, at the route.
 *
 * The rule being protected: a rejection refuses somebody's work and must be
 * explainable afterwards. The console asks for a reason too, but the console is
 * not a control, so every case below sends its own request.
 */

const mocks = vi.hoisted(() => ({
  caller: null as unknown,
  decideApproval: vi.fn(),
  recordDecision: vi.fn(),
  listTaskPage: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock("@/lib/agents/auth", () => {
  const callerOrganizationId = (caller: {
    kind: string;
    organizationId?: string;
    agent?: { organizationId: string };
  }) => (caller.kind === "agent" ? caller.agent!.organizationId : caller.organizationId!);
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
  decideApproval: (...a: unknown[]) => mocks.decideApproval(...a),
  recordDecision: (...a: unknown[]) => mocks.recordDecision(...a),
  listTaskPage: (...a: unknown[]) => mocks.listTaskPage(...a),
  listTasks: (...a: unknown[]) => mocks.listTasks(...a),
  createTask: (...a: unknown[]) => mocks.createTask(...a),
}));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const APPROVAL = "44444444-4444-4444-8444-444444444444";
const TASK = "55555555-5555-4555-8555-555555555555";

const OWNER = { kind: "owner", userId: "user-alpha-1", organizationId: ORG_A, role: "owner" };
const MEMBER = { kind: "owner", userId: "user-alpha-2", organizationId: ORG_A, role: "member" };
const AGENT = {
  kind: "agent",
  agent: { id: TASK, organizationId: ORG_A, slug: "a-agent", scopes: ["approval:request"] },
};

function decideRequest(body: unknown, id = APPROVAL) {
  return new Request(`http://localhost/api/agents/approvals/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = (id = APPROVAL) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.caller = OWNER;
  mocks.decideApproval.mockReset().mockResolvedValue({
    id: APPROVAL,
    taskId: TASK,
    reason: "spends money",
    status: "rejected",
  });
  mocks.recordDecision.mockReset().mockResolvedValue({ id: "d1" });
  mocks.listTaskPage.mockReset();
  mocks.listTasks.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PRIORITY 1: a rejection must carry a real reason", () => {
  test("no reason at all is refused", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "rejected" }), ctx());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).reason, "reason_required");
    assert.equal(mocks.decideApproval.mock.calls.length, 0, "refused before any write");
  });

  test("a whitespace-only reason is refused", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    for (const reason of ["   ", "\n\t ", "  \u00a0  "]) {
      const response = await POST(decideRequest({ decision: "rejected", reason }), ctx());
      assert.equal(response.status, 400, JSON.stringify(reason));
      assert.equal((await response.json()).reason, "reason_required");
    }
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("a three-character reason is too thin to be an explanation", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "rejected", reason: " no" }), ctx());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).reason, "reason_too_short");
  });

  test("an excessively long reason is refused rather than truncated", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(
      decideRequest({ decision: "rejected", reason: "x".repeat(1001) }),
      ctx()
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).reason, "reason_too_long");
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("the legacy `note` field still satisfies the rule", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(
      decideRequest({ decision: "rejected", note: "duplicate of yesterday's run" }),
      ctx()
    );
    assert.equal(response.status, 200);
    assert.equal(mocks.recordDecision.mock.calls.length, 0, "the domain writes history, not the route");
  });

  test("approval without a reason still works: a yes needs no excuse", async () => {
    mocks.decideApproval.mockResolvedValue({
      id: APPROVAL,
      taskId: TASK,
      reason: "spends money",
      status: "approved",
    });
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(response.status, 200);
    assert.equal(mocks.recordDecision.mock.calls.length, 0, "the domain writes history, not the route");
  });
});

describe("PRIORITY 1: who may decide, and what a refusal costs them", () => {
  test("no session", async () => {
    mocks.caller = null;
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(response.status, 401);
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });

  test("an agent key cannot decide its own request, with or without a reason", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    for (const body of [{ decision: "approved" }, { decision: "rejected", reason: "please" }]) {
      const response = await POST(decideRequest(body), ctx());
      assert.equal(response.status, 403);
      assert.equal((await response.json()).reason, "owner_or_admin_required");
    }
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
    assert.equal(mocks.recordDecision.mock.calls.length, 0);
  });

  test("a member cannot decide either", async () => {
    mocks.caller = MEMBER;
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(response.status, 403);
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });
});

describe("PRIORITY 1: duplicates and other tenants", () => {
  test("a second decision changes nothing and writes no history", async () => {
    mocks.decideApproval.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const first = await POST(decideRequest({ decision: "rejected", reason: "not safe" }), ctx());
    const second = await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(first.status, 404);
    assert.equal(second.status, 404);
    assert.equal(mocks.recordDecision.mock.calls.length, 0, "no history for a lost race");
  });

  test("another tenant's approval answers exactly like a missing one", async () => {
    mocks.caller = { ...OWNER, organizationId: ORG_B };
    mocks.decideApproval.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "not_found", "no hint that it exists elsewhere");
  });

  test("the organisation always comes from the session, never the body", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const smuggled = await POST(
      decideRequest({ decision: "approved", organizationId: ORG_B }),
      ctx()
    );
    assert.equal(smuggled.status, 400, "an unexpected field is rejected outright");

    await POST(decideRequest({ decision: "approved" }), ctx());
    assert.equal(mocks.decideApproval.mock.calls[0][0].organizationId, ORG_A);
  });

  test("a malformed approval id never reaches the domain", async () => {
    const { POST } = await import("@/app/api/agents/approvals/[id]/route");
    const response = await POST(decideRequest({ decision: "approved" }, "nope"), ctx("nope"));
    assert.equal(response.status, 400);
    assert.equal(mocks.decideApproval.mock.calls.length, 0);
  });
});

describe("PRIORITY 4: the history route rejects a cursor it did not issue", () => {
  const getRequest = (qs: string) =>
    new Request(`http://localhost/api/agents/tasks${qs}`, { method: "GET" });

  test("a forged cursor is a bad request, not an empty page", async () => {
    const { GET } = await import("@/app/api/agents/tasks/route");
    for (const raw of ["garbage", "Zm9v", Buffer.from("not-a-date|no-uuid").toString("base64url")]) {
      const response = await GET(getRequest(`?cursor=${encodeURIComponent(raw)}`));
      assert.equal(response.status, 400, raw);
      assert.equal((await response.json()).reason, "invalid_cursor");
    }
    assert.equal(mocks.listTaskPage.mock.calls.length, 0);
  });
});
