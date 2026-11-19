import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** The workspace's credentials, as the catalog would return them. */
const credentials = vi.hoisted(() => ({
  connected: new Set<string>(["slack", "meta_ads"]),
  asked: [] as string[],
}));

vi.mock("@/lib/integrations/catalog", () => ({
  getIntegrationTokens: async (workspaceId: string, providerId: string) => {
    credentials.asked.push(`${workspaceId}:${providerId}`);
    return credentials.connected.has(providerId)
      ? { accessToken: "test-credential-not-real", status: "connected" }
      : null;
  },
  getIntegrationUsage: async () => 0,
  recordIntegrationUsage: async () => {},
  appendAudit: async () => {},
  markConnectionError: async () => {},
}));

/** The executor's answers, driven per test. */
const executor = vi.hoisted(() => ({
  calls: [] as Array<{ workspaceId: string; providerId: string; operationId: string }>,
  result: null as unknown,
}));

vi.mock("@/lib/integrations/connectors/execute", () => ({
  runConnectorOperation: async (input: {
    workspaceId: string;
    providerId: string;
    operationId: string;
  }) => {
    executor.calls.push(input);
    return executor.result;
  },
}));

/** The registry, with the real specs plus one write spec a provider must never expose. */
const registry = vi.hoisted(() => ({ specs: [] as any[] }));

vi.mock("@/lib/integrations/connectors/registry", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/connectors/registry")
  >("@/lib/integrations/connectors/registry");
  registry.specs = [...actual.CONNECTOR_SPECS];
  return {
    CONNECTOR_SPECS: registry.specs,
    connectorProviderIds: actual.connectorProviderIds,
    getConnectorSpec: (providerId: string) =>
      registry.specs.find((spec) => spec.providerId === providerId) ?? null,
  };
});

import { connectorCatalog, connectorRead } from "@/lib/agents/worker-tools/connector-run";
import { WORKER_TOOLS } from "@/lib/agents/worker";
import { toolCatalog, isKnownTool } from "@/lib/agents/agent-tools";

const CONTEXT = {
  organizationId: "org_tenant_a",
  agentId: "agent_1",
  payload: {} as Record<string, unknown>,
  signal: new AbortController().signal,
  fetchImpl: fetch,
};

function run(payload: Record<string, unknown>, organizationId = CONTEXT.organizationId) {
  return connectorRead.run({ ...CONTEXT, organizationId, payload });
}

beforeEach(() => {
  executor.calls = [];
  executor.result = null;
  credentials.asked = [];
});

test("the agent is offered both connector tools, and neither claims to write", () => {
  assert.equal(WORKER_TOOLS.connector_catalog.readOnly, true);
  assert.equal(WORKER_TOOLS.connector_read.readOnly, true);
  assert.ok(isKnownTool("connector_read"));
  const catalog = toolCatalog();
  const ids = catalog.map((entry) => entry.id);
  assert.ok(ids.includes("connector_catalog"));
  assert.ok(ids.includes("connector_read"));
  for (const id of ["connector_catalog", "connector_read"]) {
    assert.equal(catalog.find((entry) => entry.id === id)!.writes, false);
  }
});

test("the catalog reports this workspace's connections, not the platform's", async () => {
  const result = await connectorCatalog.run(CONTEXT);
  assert.equal(result.ok, true);
  const evidence = JSON.parse((result as { evidence: string }).evidence) as {
    providers: Array<{ providerId: string; connected: boolean; readOperations: unknown[] }>;
  };
  assert.ok(evidence.providers.length >= 19);
  const byId = new Map(evidence.providers.map((p) => [p.providerId, p]));
  assert.equal(byId.get("slack")!.connected, true);
  assert.equal(byId.get("meta_ads")!.connected, true);
  assert.equal(byId.get("hubspot")!.connected, false);
  for (const provider of evidence.providers) {
    assert.ok(provider.readOperations.length >= 1, `${provider.providerId} lists no read op`);
  }
  // Every lookup was scoped to the task's workspace.
  assert.ok(credentials.asked.every((entry) => entry.startsWith("org_tenant_a:")));
  assert.match((result as { summary: string }).summary, /connectors/);
});

test("the workspace comes from the task, never from the payload", async () => {
  executor.result = { ok: true, providerId: "slack", operationId: "list_channels", status: 200, summary: { rows: [] }, count: 0 };
  await run({
    providerId: "slack",
    operationId: "list_channels",
    // A model trying to widen its reach: both spellings are ignored.
    organizationId: "org_tenant_b",
    workspaceId: "org_tenant_b",
  });
  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].workspaceId, "org_tenant_a");
});

test("a write operation is refused before the executor or the credential is touched", async () => {
  registry.specs.push({
    providerId: "fake_writer",
    label: "Fake",
    labelAr: "وهمي",
    credentialType: "token",
    credentialHintEn: "a token",
    credentialHintAr: "توكن",
    parse: (raw: string) => ({ token: raw }),
    auth: { kind: "bearer" },
    verify: { method: "GET", url: () => "https://example.com" },
    describe: () => ({ accountId: "a", accountName: "a", extra: {} }),
    operations: [
      {
        id: "pause_campaign",
        titleEn: "Pause",
        titleAr: "إيقاف",
        kind: "write",
        method: "POST",
        url: () => "https://example.com/pause",
      },
    ],
    blockers: [],
    scopes: [],
    docsUrl: "https://example.com",
    writeStatus: "excluded on purpose, this is only a fixture for the guard",
  });

  const result = await run({ providerId: "fake_writer", operationId: "pause_campaign" });
  assert.equal(result.ok, false);
  assert.equal((result as { error: string }).error, "write_blocked");
  assert.equal(executor.calls.length, 0);
});

test("unknown ids are refused without a request", async () => {
  const noProvider = await run({ providerId: "myspace", operationId: "list" });
  assert.equal((noProvider as { error: string }).error, "unknown_provider");

  const noOperation = await run({ providerId: "slack", operationId: "delete_everything" });
  assert.equal((noOperation as { error: string }).error, "unknown_operation");

  const empty = await run({ providerId: "slack" });
  assert.equal((empty as { error: string }).error, "invalid_payload");

  assert.equal(executor.calls.length, 0);
});

test("a refusal from the executor is reported in words, with no rows", async () => {
  executor.result = {
    ok: false,
    providerId: "slack",
    operationId: "list_channels",
    error: "not_connected",
    code: "not_connected",
  };
  const result = await run({ providerId: "slack", operationId: "list_channels" });
  assert.equal(result.ok, false);
  assert.match((result as { summary: string }).summary, /no credential/);
  assert.equal((result as { evidence?: unknown }).evidence, undefined);
});

test("a successful read returns rows, and a credential inside them is redacted", async () => {
  executor.result = {
    ok: true,
    providerId: "meta_ads",
    operationId: "list_campaigns",
    status: 200,
    count: 2,
    summary: [
      { id: "1", name: "Campaign A", access_token: "Bearer sk-abcdefghijklmnopqrstuv" },
      { id: "2", name: "Campaign B" },
    ],
  };
  const result = await run({ providerId: "meta_ads", operationId: "list_campaigns" });
  assert.equal(result.ok, true);
  assert.match((result as { summary: string }).summary, /2 rows/);
  const evidence = (result as { evidence: string }).evidence;
  assert.ok(!evidence.includes("sk-abcdefghijklmnopqrstuv"), "a credential survived into evidence");
  assert.ok(evidence.includes("[redacted]"));
});

test("one huge answer is truncated instead of becoming the artifact", async () => {
  executor.result = {
    ok: true,
    providerId: "airtable",
    operationId: "list_records",
    status: 200,
    count: 1,
    summary: { blob: "x".repeat(60_000) },
  };
  const result = await run({ providerId: "airtable", operationId: "list_records" });
  const evidence = (result as { evidence: string }).evidence;
  assert.ok(evidence.length <= 20_100, `evidence was ${evidence.length} chars`);
  assert.ok(evidence.endsWith("…[truncated]"));
});
