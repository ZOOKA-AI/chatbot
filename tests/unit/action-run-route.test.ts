import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * The run endpoint's own guards.
 *
 * The runner decides whether work may exist; this route decides who may ask. Both matter: a
 * caller without a session must not reach the runner at all, and a member without management
 * rights must not spend the workspace's allowance on a timer nobody is watching.
 */

const holder = vi.hoisted(() => ({
  caller: null as null | Record<string, unknown>,
  calls: [] as Array<Record<string, unknown>>,
  result: { ok: true, taskId: "t1", status: "pending", deduplicated: false } as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/commander-scope", () => ({ withCommanderTenant: <T,>(handler: T) => handler }));
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => holder.caller,
  callerOrganizationId: (caller: { kind: string; organizationId?: string; agent?: { organizationId: string } }) =>
    caller.kind === "agent" ? caller.agent!.organizationId : caller.organizationId,
  canManage: (caller: { kind: string; role?: string }) =>
    caller.kind === "owner" && ["owner", "admin"].includes(String(caller.role)),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/actions/run", () => ({
  runAction: async (input: Record<string, unknown>) => {
    holder.calls.push(input);
    return holder.result;
  },
}));

const { POST } = await import("@/app/api/actions/[actionId]/run/route");

const owner = { kind: "owner", userId: "user-1", organizationId: "org-a", role: "owner" };
const member = { kind: "owner", userId: "user-2", organizationId: "org-a", role: "member" };

const post = (body: unknown) =>
  POST(
    new Request("https://zooka-ai.com/api/actions/repo_health_report/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ actionId: "repo_health_report" }) }
  );

beforeEach(() => {
  holder.caller = owner;
  holder.calls = [];
  holder.result = { ok: true, taskId: "t1", status: "pending", deduplicated: false };
});

describe("who may run an action", () => {
  test("no session is refused without reaching the runner", async () => {
    holder.caller = null;
    const response = await post({ projectId: "11111111-1111-4111-8111-111111111111", inputs: { repo: "a/b" } });
    assert.equal(response.status, 401);
    assert.equal(holder.calls.length, 0);
  });

  test("a member may read the catalog but not spend an allowance", async () => {
    holder.caller = member;
    const response = await post({ projectId: "11111111-1111-4111-8111-111111111111", inputs: { repo: "a/b" } });
    assert.equal(response.status, 403);
    assert.equal(holder.calls.length, 0);
  });
});

describe("a project is required in the body", () => {
  test("neither id nor name means 400 before the runner is called", async () => {
    const response = await post({ inputs: { repo: "a/b" } });
    assert.equal(response.status, 400);
    assert.equal(holder.calls.length, 0);
  });

  test("unknown body keys are refused", async () => {
    const response = await post({ projectId: "11111111-1111-4111-8111-111111111111", tool: "shell" });
    assert.equal(response.status, 400);
    assert.equal(holder.calls.length, 0);
  });
});

describe("the runner's answer is passed through honestly", () => {
  test("a refusal keeps its own status and reason", async () => {
    holder.result = { ok: false, error: "no_assigned_agent", status: 409 };
    const response = await post({ projectId: "11111111-1111-4111-8111-111111111111", inputs: { repo: "a/b" } });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, "no_assigned_agent");
  });

  test("a created task answers 201 with the real task id", async () => {
    const response = await post({ projectId: "11111111-1111-4111-8111-111111111111", inputs: { repo: "a/b" } });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.taskId, "t1");
    assert.equal(body.status, "pending");
  });

  test("the organisation comes from the caller, never from the body", async () => {
    await post({
      projectId: "11111111-1111-4111-8111-111111111111",
      organizationId: "org-elsewhere",
      inputs: { repo: "a/b" },
    });
    assert.equal(holder.calls.length, 0, "an unknown body key must be refused, not trusted");
  });
});
