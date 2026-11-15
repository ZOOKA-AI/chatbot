import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const catalog = vi.hoisted(() => ({
  tokens: null as Record<string, unknown> | null,
  audit: [] as unknown[],
  usage: [] as unknown[],
  errors: [] as unknown[],
}));

vi.mock("@/lib/integrations/catalog", () => ({
  getIntegrationTokens: async () => catalog.tokens,
  getIntegrationUsage: async () => 0,
  recordIntegrationUsage: async (workspaceId: string, metric: string) => {
    catalog.usage.push({ workspaceId, metric });
  },
  appendAudit: async (entry: unknown) => {
    catalog.audit.push(entry);
  },
  markConnectionError: async (workspaceId: string, providerId: string) => {
    catalog.errors.push({ workspaceId, providerId });
  },
}));

import { buildHeaders } from "@/lib/integrations/connectors/auth";
import {
  CONNECTOR_SPECS,
  connectorProviderIds,
  getConnectorSpec,
} from "@/lib/integrations/connectors/registry";
import {
  runConnectorOperation,
  verifyConnectorConnection,
} from "@/lib/integrations/connectors/execute";
import {
  buildIntegrationMatrix,
  matrixTotals,
  renderMatrixMarkdown,
} from "@/lib/integrations/connectors/matrix";
import { INTEGRATION_PLAYBOOKS } from "@/lib/integrations/playbooks";
import { TOKEN_PROVIDERS } from "@/lib/integrations/token-providers";
import { CONNECTOR_TOKEN_PROVIDERS } from "@/lib/integrations/connectors/token-specs";

const REQUESTED = [
  "slack",
  "notion",
  "twilio",
  "shopify",
  "tiktok",
  "whatsapp",
  "x",
  "cloudflare",
  "namecheap",
];

test("all nine requested connectors exist and expose only reads", () => {
  assert.deepEqual([...connectorProviderIds()].sort(), [...REQUESTED].sort());
  for (const spec of CONNECTOR_SPECS) {
    assert.ok(spec.operations.length >= 1, `${spec.providerId} has no operations`);
    for (const operation of spec.operations) {
      assert.equal(operation.kind, "read", `${spec.providerId}.${operation.id} is a write`);
    }
    assert.ok(spec.writeStatus.length > 20, `${spec.providerId} must explain missing writes`);
    assert.ok(spec.credentialHintEn.length > 5);
    assert.ok(spec.credentialHintAr.length > 5);
    assert.ok(spec.docsUrl.startsWith("https://"));
  }
});

test("compound credentials parse into the fields their URLs need", () => {
  const twilio = getConnectorSpec("twilio")!;
  const twilioFields = twilio.parse("AC1234567890:secret-token");
  assert.equal(twilioFields.sid, "AC1234567890");
  assert.equal(twilioFields.token, "secret-token");
  assert.match(twilio.verify.url(twilioFields), /Accounts\/AC1234567890\.json$/);

  const shopify = getConnectorSpec("shopify")!;
  const shopifyFields = shopify.parse("shpat_abc|https://demo.myshopify.com/");
  assert.equal(shopifyFields.shop, "demo.myshopify.com");
  assert.equal(
    shopify.verify.url(shopifyFields),
    "https://demo.myshopify.com/admin/api/2024-10/shop.json"
  );

  const whatsapp = getConnectorSpec("whatsapp")!;
  const waFields = whatsapp.parse("123456789012345|EAAG-token");
  assert.equal(waFields.phoneNumberId, "123456789012345");
  assert.match(whatsapp.verify.url(waFields), /\/123456789012345\?fields=/);

  const namecheap = getConnectorSpec("namecheap")!;
  const ncFields = namecheap.parse("helmy|key-123");
  assert.equal(ncFields.user, "helmy");
  assert.match(namecheap.verify.url(ncFields), /ApiUser=helmy/);
});

test("auth strategies produce the exact headers the providers expect", () => {
  const slack = getConnectorSpec("slack")!;
  assert.deepEqual(buildHeaders(slack, { token: "xoxb-1" }), {
    Authorization: "Bearer xoxb-1",
  });

  const notion = getConnectorSpec("notion")!;
  const notionHeaders = buildHeaders(notion, { token: "ntn_1" });
  assert.equal(notionHeaders.Authorization, "Bearer ntn_1");
  assert.equal(notionHeaders["Notion-Version"], "2022-06-28");

  const twilio = getConnectorSpec("twilio")!;
  const basic = buildHeaders(twilio, { sid: "AC1", token: "t" });
  assert.equal(
    basic.Authorization,
    `Basic ${Buffer.from("AC1:t").toString("base64")}`
  );

  const shopify = getConnectorSpec("shopify")!;
  assert.deepEqual(buildHeaders(shopify, { token: "shpat_x", shop: "s.myshopify.com" }), {
    "X-Shopify-Access-Token": "shpat_x",
  });
});

test("executor refuses what it cannot prove", async () => {
  catalog.tokens = null;
  const notConnected = await runConnectorOperation({
    workspaceId: "org_1",
    providerId: "slack",
    operationId: "list_channels",
  });
  assert.equal(notConnected.ok, false);
  assert.equal(notConnected.ok === false && notConnected.code, "not_connected");

  const unknownProvider = await runConnectorOperation({
    workspaceId: "org_1",
    providerId: "myspace",
    operationId: "x",
  });
  assert.equal(unknownProvider.ok === false && unknownProvider.code, "unknown_provider");

  const unknownOperation = await runConnectorOperation({
    workspaceId: "org_1",
    providerId: "slack",
    operationId: "delete_everything",
  });
  assert.equal(unknownOperation.ok === false && unknownOperation.code, "unknown_operation");

  const verify = await verifyConnectorConnection({
    workspaceId: "org_1",
    providerId: "notion",
  });
  assert.equal(verify.ok === false && verify.code, "not_connected");
  // A refusal must not fabricate an audit row or a usage count.
  assert.equal(catalog.audit.length, 0);
  assert.equal(catalog.usage.length, 0);
});

test("every connector is documented and wired into the secure card", () => {
  const documented = new Set(INTEGRATION_PLAYBOOKS.map((entry) => entry.providerId));
  for (const id of connectorProviderIds()) {
    assert.ok(documented.has(id), `${id} has no playbook`);
  }
  const tokenCapable = Object.keys(CONNECTOR_TOKEN_PROVIDERS).sort();
  assert.deepEqual(tokenCapable, [
    "cloudflare",
    "notion",
    "shopify",
    "slack",
    "tiktok",
    "twilio",
    "whatsapp",
    "x",
  ]);
  for (const id of tokenCapable) {
    const definition = TOKEN_PROVIDERS[id as keyof typeof TOKEN_PROVIDERS];
    assert.ok(definition, `${id} missing from TOKEN_PROVIDERS`);
    assert.ok(definition.validateUrl, `${id} has no validation endpoint`);
  }
  // Namecheap cannot validate from our egress, so it must not offer a card.
  assert.equal("namecheap" in TOKEN_PROVIDERS, false);
});

test("matrix reflects code, and never claims an unperformed verification", () => {
  const rows = buildIntegrationMatrix();
  assert.equal(rows.length, INTEGRATION_PLAYBOOKS.length);
  const byId = new Map(rows.map((row) => [row.providerId, row]));
  for (const id of REQUESTED) {
    const row = byId.get(id);
    assert.ok(row, `${id} missing from the matrix`);
    assert.equal(row.documentationReady, true);
    assert.equal(row.multiTenantIsolationVerified, true);
  }
  assert.equal(byId.get("namecheap")!.providerImplemented, true);
  assert.equal(byId.get("namecheap")!.agentToolsVerified, true);
  assert.ok(byId.get("namecheap")!.blockers.length > 0);
  for (const row of rows) {
    assert.equal(row.authenticationVerified, false, `${row.providerId} claimed auth`);
    assert.equal(row.readOperationsVerified, false, `${row.providerId} claimed reads`);
    assert.equal(row.writeOperationsVerified, false, `${row.providerId} claimed writes`);
  }
  const totals = matrixTotals(rows);
  assert.equal(totals.total, rows.length);
  assert.equal(totals.documented, rows.length);
  assert.ok(totals.implemented >= 24);
  const markdown = renderMatrixMarkdown(rows);
  assert.equal(markdown.trim().split("\n").length, rows.length + 2);
});
