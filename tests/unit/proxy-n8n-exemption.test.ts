import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { POST as drain } from "@/app/api/integrations/n8n/tiktok/run/route";

/**
 * n8n has no browser session, so the proxy must let its call through to the
 * route, and the route must still refuse anything that cannot prove it is n8n.
 * Both halves are asserted: an exemption without the route's own check would be
 * an open publishing endpoint.
 */
const PROXY = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

test("the proxy lets the n8n drain path reach its route", () => {
  assert.ok(
    PROXY.includes('pathname.startsWith("/api/integrations/n8n/")'),
    "n8n calls are still bounced to the session gate, so the queue can never drain"
  );
});

test("the exemption is narrower than the whole integrations surface", () => {
  // The OAuth routes must keep requiring a session: exempting /api/integrations
  // wholesale would let anyone start or complete a connection.
  assert.equal(
    PROXY.includes('pathname.startsWith("/api/integrations/")'),
    false,
    "the exemption is too wide: it must name the machine-to-machine prefix only"
  );
});

test("an unconfigured secret refuses everything instead of publishing", async () => {
  delete process.env.N8N_WEBHOOK_SECRET;
  const response = await drain(
    new Request("https://zooka-ai.com/api/integrations/n8n/tiktok/run", {
      method: "POST",
      headers: { "content-type": "application/json", "x-n8n-secret": "anything" },
      body: JSON.stringify({ organizationId: "00000000-0000-0000-0000-000000000000" }),
    })
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "n8n_webhook_secret_not_configured");
});

test("the route refuses a call with no shared secret", async () => {
  process.env.N8N_WEBHOOK_SECRET = "test-only-secret-value";
  const response = await drain(
    new Request("https://zooka-ai.com/api/integrations/n8n/tiktok/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "00000000-0000-0000-0000-000000000000" }),
    })
  );
  assert.equal(response.status, 401);
});

test("the route refuses a wrong shared secret", async () => {
  process.env.N8N_WEBHOOK_SECRET = "test-only-secret-value";
  const response = await drain(
    new Request("https://zooka-ai.com/api/integrations/n8n/tiktok/run", {
      method: "POST",
      headers: { "content-type": "application/json", "x-n8n-secret": "not-the-secret" },
      body: JSON.stringify({ organizationId: "00000000-0000-0000-0000-000000000000" }),
    })
  );
  assert.equal(response.status, 401);
});
