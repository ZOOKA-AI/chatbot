import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

/**
 * Executor acceptance: the four guarantees that make a connector safe to hand to
 * a multi-tenant agent. None of these touch a network or a database.
 */
const { catalog } = vi.hoisted(() => ({
  catalog: {
    getIntegrationTokens: vi.fn(),
    getIntegrationUsage: vi.fn(),
    recordIntegrationUsage: vi.fn(),
    appendAudit: vi.fn(),
    markConnectionError: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/integrations/catalog", () => catalog);

import {
  CONNECTOR_READ_CAP_PER_MONTH,
  runConnectorOperation,
  verifyConnectorConnection,
} from "@/lib/integrations/connectors/execute";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  catalog.getIntegrationUsage.mockResolvedValue(0);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("an unconnected workspace is refused before any request leaves the server", async () => {
  catalog.getIntegrationTokens.mockResolvedValue(null);
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);

  const result = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "slack",
    operationId: "list_channels",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "not_connected");
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(catalog.recordIntegrationUsage.mock.calls.length, 0);
});

test("the monthly read cap stops the call and says why", async () => {
  catalog.getIntegrationTokens.mockResolvedValue({ accessToken: "xoxb-test-token-123456" });
  catalog.getIntegrationUsage.mockResolvedValue(CONNECTOR_READ_CAP_PER_MONTH);
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);

  const result = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "slack",
    operationId: "list_channels",
  });

  assert.equal(result.ok === false && result.code, "usage_limit");
  assert.equal(fetchSpy.mock.calls.length, 0);
});

test("a read is scoped to its own workspace, audited, and metered", async () => {
  catalog.getIntegrationTokens.mockResolvedValue({ accessToken: "xoxb-test-token-123456" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ ok: true, channels: [{ id: "C1", name: "general" }] }))
  );

  const result = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "slack",
    operationId: "list_channels",
    userId: "user-1",
  });

  assert.equal(result.ok, true);
  // The credential lookup must carry the caller's workspace, never another one.
  assert.deepEqual(catalog.getIntegrationTokens.mock.calls[0], ["ws-a", "slack"]);
  assert.deepEqual(catalog.getIntegrationUsage.mock.calls[0], ["ws-a", "connector_read_slack"]);
  const audit = catalog.appendAudit.mock.calls[0][0];
  assert.equal(audit.workspaceId, "ws-a");
  assert.equal(audit.action, "read:list_channels");
  assert.equal(audit.userId, "user-1");
  assert.equal(catalog.recordIntegrationUsage.mock.calls[0][0], "ws-a");
});

test("two workspaces never share a credential lookup or an audit row", async () => {
  catalog.getIntegrationTokens
    .mockResolvedValueOnce({ accessToken: "xoxb-aaaa-1111111111" })
    .mockResolvedValueOnce({ accessToken: "xoxb-bbbb-2222222222" });
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, channels: [] })));

  await runConnectorOperation({ workspaceId: "ws-a", providerId: "slack", operationId: "list_channels" });
  await runConnectorOperation({ workspaceId: "ws-b", providerId: "slack", operationId: "list_channels" });

  const lookups = catalog.getIntegrationTokens.mock.calls.map((call) => call[0]);
  assert.deepEqual(lookups, ["ws-a", "ws-b"]);
  const audits = catalog.appendAudit.mock.calls.map((call) => call[0].workspaceId);
  assert.deepEqual(audits, ["ws-a", "ws-b"]);
});

test("a revoked credential is marked on the connection instead of silently failing", async () => {
  catalog.getIntegrationTokens.mockResolvedValue({ accessToken: "xoxb-expired-000000" });
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 401)));

  const result = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "slack",
    operationId: "team_info",
  });

  assert.equal(result.ok === false && result.code, "provider_error");
  assert.equal(catalog.markConnectionError.mock.calls[0][1], "slack");
});

test("unknown providers and operations are refused with the real options listed", async () => {
  const noProvider = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "stripe",
    operationId: "list_channels",
  });
  assert.equal(noProvider.ok === false && noProvider.code, "unknown_provider");

  catalog.getIntegrationTokens.mockResolvedValue({ accessToken: "xoxb-test-token-123456" });
  const noOperation = await runConnectorOperation({
    workspaceId: "ws-a",
    providerId: "slack",
    operationId: "delete_channel",
  });
  assert.equal(noOperation.ok === false && noOperation.code, "unknown_operation");
  assert.match(
    noOperation.ok === false ? noOperation.error : "",
    /list_channels, team_info/
  );
});

test("verifying a connection uses the stored credential and refuses when absent", async () => {
  catalog.getIntegrationTokens.mockResolvedValue(null);
  const missing = await verifyConnectorConnection({
    workspaceId: "ws-a",
    providerId: "cloudflare",
  });
  assert.equal(missing.ok === false && missing.code, "not_connected");

  catalog.getIntegrationTokens.mockResolvedValue({ accessToken: "cf-token-1234567890" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ success: true, result: { id: "tok-abc", status: "active" } }))
  );
  const verified = await verifyConnectorConnection({
    workspaceId: "ws-a",
    providerId: "cloudflare",
  });
  assert.equal(verified.ok, true);
});
