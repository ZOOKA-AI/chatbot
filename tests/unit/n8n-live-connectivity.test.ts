import assert from "node:assert/strict";
import { describe, test } from "vitest";

/**
 * Proves the dashboard against a real n8n instance, but only when an owner-issued API key is present.
 *
 * It is skipped rather than mocked when the key is absent: a mocked "connected" is exactly the false
 * green this dashboard exists to prevent, and the repository has no n8n REST key today (the instance's
 * Settings → n8n API is the only place one can be created, and that needs the owner's session).
 *
 * Run it locally with:  N8N_LIVE_BASE_URL=https://<host> N8N_LIVE_API_KEY=<key> pnpm exec vitest run tests/unit/n8n-live-connectivity.test.ts
 */
const baseUrl = process.env.N8N_LIVE_BASE_URL ?? "";
const apiKey = process.env.N8N_LIVE_API_KEY ?? "";

describe.skipIf(!baseUrl || !apiKey)("live n8n connectivity", () => {
  test("an authorized key reaches the instance and reports a measured stage", async () => {
    const { buildN8nAdminOverview } = await import("@/lib/integrations/n8n/admin-overview");
    const { vi } = await import("vitest");
    vi.doMock("@/lib/integrations/n8n/store", () => ({
      getN8nCredentials: async () => ({ baseUrl, apiKey }),
    }));
    const overview = await buildN8nAdminOverview("org-live");
    assert.notEqual(overview.stage, "not_configured");
    assert.equal(overview.probeError, null, `probe failed: ${overview.probeError}`);
    assert.ok(overview.workflowCount >= 0);
    assert.ok(overview.workflows.every((row) => row.deepLink.startsWith(baseUrl)));
  }, 30_000);
});
