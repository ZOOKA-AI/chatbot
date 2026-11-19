import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const caller: { value: unknown } = { value: null };
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => caller.value,
  callerOrganizationId: (c: { organizationId: string }) => c.organizationId,
  canManage: (c: { role: string }) => c.role === "owner" || c.role === "admin",
  json: (data: unknown, status = 200) => Response.json(data as object, { status }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: (reason: string) => Response.json({ error: reason }, { status: 403 }),
}));

const healthResult = { value: null as unknown };
vi.mock("@/lib/agents/health", () => ({
  workspaceExecutionHealth: async () => healthResult.value,
}));

// The tenant wrapper is exercised by the scope guard and its own suite; here the
// question is only what the handler does with the caller it is given.
vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderTenant: (handler: unknown) => handler,
}));

import { GET } from "@/app/api/agents/health/route";

const request = () => new Request("https://zooka-ai.com/api/agents/health");
const ORG = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  caller.value = null;
  healthResult.value = {
    verdict: "ok",
    generatedAt: new Date().toISOString(),
    signals: [{ name: "queue", status: "ok", detail: "nothing is waiting" }],
    counts: { pending: 0, running: 0, failedLastHour: 0, stuckLeases: 0, approvalsWaiting: 0 },
  };
});

describe("who may read execution health", () => {
  test("no session is refused before any query", async () => {
    const response = await GET(request());
    assert.equal(response.status, 401);
  });

  test("a member is refused: the queue is not theirs to act on", async () => {
    caller.value = { organizationId: ORG, role: "member" };
    const response = await GET(request());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "owner_or_admin_required");
  });

  test("an owner reads their own workspace's health", async () => {
    caller.value = { organizationId: ORG, role: "owner" };
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).verdict, "ok");
  });

  test("a critical verdict answers 503 so a status-code monitor sees it", async () => {
    caller.value = { organizationId: ORG, role: "admin" };
    healthResult.value = {
      verdict: "critical",
      generatedAt: new Date().toISOString(),
      signals: [{ name: "leases", status: "critical", detail: "1 execution(s) expired without a heartbeat" }],
      counts: { pending: 0, running: 1, failedLastHour: 0, stuckLeases: 1, approvalsWaiting: 0 },
    };
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).verdict, "critical");
  });
});
