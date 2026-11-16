import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The routes import server-only code, and next-auth does not resolve under vitest.
vi.mock("server-only", () => ({}));

type Caller =
  | { kind: "agent"; agent: Record<string, unknown> }
  | { kind: "owner"; userId: string; organizationId: string; role: string };

const state = vi.hoisted(() => ({
  caller: null as unknown,
  retryCalls: [] as Record<string, unknown>[],
  retryResult: { ok: true, task: { id: "t1" } } as unknown,
}));

// Same shape as the authorization suite: auth is mocked wholesale because the
// real module pulls next-auth, which does not resolve under vitest. canManage is
// reproduced faithfully here (owner or admin, and only for a human caller).
vi.mock("@/lib/agents/auth", () => {
  const callerOrganizationId = (caller: {
    kind: string;
    organizationId?: string;
    agent?: { organizationId: string };
  }) => (caller.kind === "agent" ? caller.agent!.organizationId : caller.organizationId!);
  const canManage = (caller: { kind: string; role?: string }) =>
    caller.kind === "owner" && (caller.role === "owner" || caller.role === "admin");
  return {
    resolveCaller: async () => state.caller,
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
  retryTask: async (input: Record<string, unknown>) => {
    state.retryCalls.push(input);
    return state.retryResult;
  },
}));

import { copyOf } from "@/components/commander/copy";
import { canOffer, retryBlockedReason } from "@/components/commander/permissions";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";

const owner = (organizationId: string, role = "owner"): Caller => ({
  kind: "owner",
  userId: "user-1",
  organizationId,
  role,
});

const agentKey: Caller = {
  kind: "agent",
  agent: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationId: ORG_A,
    slug: "a-agent",
    role: "worker",
  },
};

function request(body: unknown, id = TASK) {
  return new Request(`http://localhost/api/agents/tasks/${id}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer key" },
    body: JSON.stringify(body),
  });
}

const ctx = (id = TASK) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.caller = owner(ORG_A);
  state.retryCalls = [];
  state.retryResult = { ok: true, task: { id: TASK, status: "pending" } };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PHASE 4: which actions the interface may offer", () => {
  test("a member is offered no state change, whatever the status", () => {
    for (const status of ["pending", "in_progress", "failed", "cancelled", "completed"]) {
      assert.equal(canOffer("cancel", { canManage: false, status }), false, status);
      assert.equal(canOffer("retry", { canManage: false, status }), false, status);
      assert.equal(canOffer("decide", { canManage: false, status: "pending" }), false);
    }
  });

  test("cancel only while the work is open", () => {
    assert.equal(canOffer("cancel", { canManage: true, status: "pending" }), true);
    assert.equal(canOffer("cancel", { canManage: true, status: "in_progress" }), true);
    for (const status of ["completed", "failed", "cancelled"]) {
      assert.equal(canOffer("cancel", { canManage: true, status }), false, status);
    }
  });

  test("retry only from a settled failure, never from work that is running or done", () => {
    assert.equal(canOffer("retry", { canManage: true, status: "failed" }), true);
    assert.equal(canOffer("retry", { canManage: true, status: "cancelled" }), true);
    for (const status of ["pending", "in_progress", "completed"]) {
      assert.equal(canOffer("retry", { canManage: true, status }), false, status);
    }
  });

  test("a decision is offered only for a pending approval", () => {
    assert.equal(canOffer("decide", { canManage: true, status: "pending" }), true);
    assert.equal(canOffer("decide", { canManage: true, status: "approved" }), false);
    assert.equal(canOffer("decide", { canManage: true, status: "rejected" }), false);
  });

  test("a retry that the server would refuse is explained before the click", () => {
    assert.equal(
      retryBlockedReason({ status: "failed", approvalRequired: true }, "rejected"),
      "approval_rejected"
    );
    assert.equal(retryBlockedReason({ status: "failed", approvalRequired: true }, "approved"), null);
    assert.equal(retryBlockedReason({ status: "failed", approvalRequired: false }, "rejected"), null);
  });
});

describe("PHASE 4: both languages carry the same interface", () => {
  const keyPaths = (value: unknown, prefix = ""): string[] => {
    if (!value || typeof value !== "object") return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  };

  test("Arabic and English define exactly the same keys", () => {
    assert.deepEqual(keyPaths(copyOf("ar")).sort(), keyPaths(copyOf("en")).sort());
  });

  test("every status the API can return has a label in both languages", () => {
    for (const status of [
      "pending",
      "in_progress",
      "completed",
      "failed",
      "blocked",
      "cancelled",
      "approved",
      "rejected",
    ]) {
      assert.ok(copyOf("ar").status[status], `ar missing ${status}`);
      assert.ok(copyOf("en").status[status], `en missing ${status}`);
    }
  });

  test("every error the routes can return has a sentence, not a raw code", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "owner_or_admin_required",
      "task_not_found",
      "not_retryable",
      "approval_rejected",
      "invalid_body",
    ]) {
      assert.notEqual(copyOf("ar").errors[code], undefined, `ar missing ${code}`);
      assert.notEqual(copyOf("en").errors[code], undefined, `en missing ${code}`);
    }
  });
});

describe("PHASE 5: the retry endpoint enforces authorisation itself", () => {
  test("no session is refused before anything else", async () => {
    state.caller = null;
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const response = await POST(request({ reason: "again" }), ctx());
    assert.equal(response.status, 401);
    assert.equal(state.retryCalls.length, 0);
  });

  test("an agent key cannot retry, even its own failure", async () => {
    state.caller = agentKey;
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const response = await POST(request({ reason: "again" }), ctx());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, "owner_or_admin_required");
    assert.equal(state.retryCalls.length, 0, "the refusal happens before any write");
  });

  test("a member cannot retry either", async () => {
    state.caller = owner(ORG_A, "member");
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const response = await POST(request({ reason: "again" }), ctx());
    assert.equal(response.status, 403);
    assert.equal(state.retryCalls.length, 0);
  });

  test("an owner retries inside their own organisation, whatever the body claims", async () => {
    state.caller = owner(ORG_A);
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const response = await POST(
      request({ reason: "again", organizationId: ORG_B }),
      ctx()
    );
    assert.equal(response.status, 400, "an unexpected field is rejected, not ignored");

    const clean = await POST(request({ reason: "again" }), ctx());
    assert.equal(clean.status, 200);
    assert.equal(state.retryCalls.length, 1);
    assert.equal(state.retryCalls[0].organizationId, ORG_A, "the tenant comes from the session");
    assert.equal(state.retryCalls[0].by, "user-1");
  });

  test("refusals from the domain map to honest status codes", async () => {
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const cases: [string, number][] = [
      ["task_not_found", 404],
      ["not_retryable", 409],
      ["approval_rejected", 409],
    ];
    for (const [error, status] of cases) {
      state.retryResult = { ok: false, error };
      const response = await POST(request({ reason: "again" }), ctx());
      assert.equal(response.status, status, error);
      assert.equal((await response.json()).reason, error);
    }
  });

  test("a malformed id or a missing reason never reaches the domain", async () => {
    const { POST } = await import("@/app/api/agents/tasks/[id]/retry/route");
    const badId = await POST(request({ reason: "again" }, "not-a-uuid"), ctx("not-a-uuid"));
    assert.equal(badId.status, 400);

    const noReason = await POST(request({}), ctx());
    assert.equal(noReason.status, 400);
    assert.equal(state.retryCalls.length, 0);
  });
});
