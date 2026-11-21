import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

/**
 * The drain endpoint's gate.
 *
 * Preview deployments sit behind Vercel SSO, so this cannot be proven with curl;
 * it is proven by calling the handler with the exact requests an attacker would
 * send. Every assertion here returns before any database or network call, which
 * is the property that matters: the wrong caller never reaches a token.
 */

const SECRET = "test-n8n-secret-value";

async function callRun(headers: Record<string, string>, body: unknown) {
  const { POST } = await import("@/app/api/integrations/n8n/tiktok/run/route");
  return POST(
    new Request("https://zooka-ai.com/api/integrations/n8n/tiktok/run", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a caller with no secret is refused", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const response = await callRun({}, { organizationId: "434c902f-eb9c-4532-b2d3-ba443e6d0ea6" });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("a caller with the wrong secret is refused", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const response = await callRun(
    { "x-n8n-secret": "not-the-secret" },
    { organizationId: "434c902f-eb9c-4532-b2d3-ba443e6d0ea6" }
  );
  assert.equal(response.status, 401);
});

test("a prefix of the secret is refused", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const response = await callRun(
    { "x-n8n-secret": SECRET.slice(0, -1) },
    { organizationId: "434c902f-eb9c-4532-b2d3-ba443e6d0ea6" }
  );
  assert.equal(response.status, 401);
});

test("with the secret but no workspace, the call is refused before any work", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const missing = await callRun({ "x-n8n-secret": SECRET }, {});
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error, "organizationId_required");

  const malformed = await callRun({ "x-n8n-secret": SECRET }, { organizationId: "not-a-uuid" });
  assert.equal(malformed.status, 400);
});

test("an unconfigured deployment says so instead of running unauthenticated", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", "");
  const response = await callRun(
    { "x-n8n-secret": "anything" },
    { organizationId: "434c902f-eb9c-4532-b2d3-ba443e6d0ea6" }
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "n8n_webhook_secret_not_configured");
});
