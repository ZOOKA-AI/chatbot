import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  context: vi.fn(),
  billing: vi.fn(),
  hub: vi.fn(),
  append: vi.fn(),
  history: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: m.context }));
vi.mock("@/lib/db/queries", () => ({
  getWorkspaceBilling: m.billing,
  appendAgentMessage: m.append,
  getAgentHistory: m.history,
}));
vi.mock("@/lib/integration-hub/server", () => ({ readHub: m.hub }));

import { GET, POST } from "@/app/api/operations/route";
import {
  agentRoles,
  commands,
  reportPriorities,
} from "@/lib/operations/catalog";

const req = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/operations", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.context.mockResolvedValue({
    organizationId: "workspace-one",
    role: "admin",
    user: { type: "regular", id: "user-one" },
  });
  m.billing.mockResolvedValue({
    subscription: { plan: "pro", status: "active" },
    usage: { messages: 8, agentRuns: 1 },
  });
  m.hub.mockResolvedValue([
    {
      id: "github",
      state: "CONFIGURED",
      checkedAt: null,
      code: null,
      account: "PRIVATE_ACCOUNT",
      grantedScopes: ["PRIVATE_SCOPE"],
    },
  ]);
  m.append.mockResolvedValue(undefined);
  m.history.mockResolvedValue([]);
});
test("all commands and roles are explicit; write commands are not marked executable", () => {
  expect(commands).toHaveLength(18);
  expect(agentRoles).toHaveLength(11);
  expect(commands.find((c) => c.id === "/build")?.mode).toBe("NOT_IMPLEMENTED");
  expect(commands.filter((c) => c.mode === "READ_ONLY")).toHaveLength(4);
  expect(
    reportPriorities({
      billingAvailable: false,
      integrationsAvailable: false,
      failedChecks: 2,
    })
  ).toHaveLength(3);
});
test("anonymous, guest and member cannot inspect administrative evidence", async () => {
  for (const context of [
    null,
    { user: { type: "guest" }, role: "owner" },
    { user: { type: "regular" }, role: "member" },
  ]) {
    m.context.mockResolvedValue(context);
    expect((await GET()).status).toBe(403);
    expect((await POST(req({ command: "/status" }))).status).toBe(403);
  }
  expect(m.billing).not.toHaveBeenCalled();
});
test("cross-origin and forged workspace requests are refused before reads", async () => {
  expect(
    (await POST(req({ command: "/status" }, "https://evil.test"))).status
  ).toBe(403);
  expect(
    (await POST(req({ command: "/status", organizationId: "other" }))).status
  ).toBe(400);
  expect(m.hub).not.toHaveBeenCalled();
});
test("build, publish and rollback cannot execute through the command endpoint", async () => {
  for (const command of ["/build", "/publish", "/rollback", "/image"]) {
    const response = await POST(req({ command }));
    expect(response.status).toBe(422);
    expect((await response.json()).executed).toBe(false);
  }
  expect(m.append).not.toHaveBeenCalled();
  expect(m.billing).not.toHaveBeenCalled();
});
test("dated report is workspace-scoped, redacts provider identities and records only its own user lane", async () => {
  const response = await POST(req({ command: "/report" }));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.report.status).toBe("READ_COMPLETE");
  expect(data.report.dailySchedule.enabled).toBe(false);
  expect(data.report.cost.actualProviderCost).toBeNull();
  expect(data.recorded).toBe(true);
  expect(JSON.stringify(data)).not.toContain("PRIVATE_");
  expect(m.billing).toHaveBeenCalledWith("workspace-one");
  expect(m.hub).toHaveBeenCalledWith("workspace-one");
  expect(m.append.mock.calls[0][0]).toMatchObject({
    organizationId: "workspace-one",
    userId: "user-one",
    conversationKey: "operations:user-one",
  });
  expect(Number.isFinite(Date.parse(data.report.generatedAt))).toBe(true);
});
test("failed database reads are partial, never healthy or zero; persistence failures stay explicit", async () => {
  m.billing.mockRejectedValueOnce(new Error("SECRET_CONNECTION_URL"));
  m.hub.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
  m.append.mockRejectedValueOnce(new Error("database unavailable"));
  const data = await (await POST(req({ command: "/report" }))).json();
  expect(data.report.status).toBe("PARTIAL");
  expect(data.report.billing).toBeNull();
  expect(data.report.integrations).toBeNull();
  expect(data.recorded).toBe(false);
  expect(data.warning).toBe("REPORT_NOT_PERSISTED");
  expect(JSON.stringify(data)).not.toContain("SECRET");
  expect(JSON.stringify(data)).not.toContain("PRIVATE_TOKEN");
});
test("history is scoped by both workspace and user, not arbitrary request params", async () => {
  expect((await GET()).status).toBe(200);
  expect(m.history).toHaveBeenCalledWith(
    "workspace-one",
    "operations:user-one",
    10
  );
});
test("cost read does not probe integrations or invent provider costs", async () => {
  const data = await (await POST(req({ command: "/cost" }))).json();
  expect(m.hub).not.toHaveBeenCalled();
  expect(data.report.cost.actualProviderCost).toBeNull();
  expect(data.report.billing.usage.messages).toBe(8);
});
