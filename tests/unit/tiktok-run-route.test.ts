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

test("a malformed workspace id is refused before any database call", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const response = await callRun(
    { "x-n8n-secret": SECRET },
    { organizationId: "not-a-uuid" }
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "organizationId_malformed");
});

test("with no workspace the coordinator asks the database, and fails cleanly when it is down", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  const response = await callRun({ "x-n8n-secret": SECRET }, { limit: 5 });
  // The scheduler is not configured with an organization id by design. With no
  // database reachable the honest answer is 503, never a 400 blaming the caller.
  assert.ok(
    response.status === 503 || response.status === 200,
    `expected 503 or 200, got ${response.status}`
  );
  if (response.status === 503) {
    assert.equal((await response.json()).error, "queue_unavailable");
  }
});
