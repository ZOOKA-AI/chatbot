import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { proxy } from "@/proxy";

/**
 * The n8n publishing scheduler has no browser session, so the proxy must let its
 * one call through. This pins the doorway to exactly one path and one method and
 * proves every neighbouring route still refuses an anonymous caller - the risk
 * with a machine exemption is never the endpoint you opened, it is the one you
 * opened by accident.
 */

const ORIGIN = "https://zooka-ai.com";
const TARGET = "/api/integrations/n8n/tiktok/run";
const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

function call(path: string, method = "POST", headers: Record<string, string> = {}) {
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method, headers }));
}

beforeEach(() => {
  getToken.mockResolvedValue(null);
});
afterEach(() => {
  getToken.mockReset();
  vi.unstubAllEnvs();
});

test("the scheduler's own call reaches the handler without a session", async () => {
  const response = await call(TARGET, "POST", { "x-n8n-secret": "whatever" });
  assert.equal(passes(response), true, "the request must reach the route, which checks the secret");
});

test("the same path refuses every other method", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
    const response = await call(TARGET, method);
    assert.equal(response.status, 401, `${method} must not be exempted`);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.code, "unauthorized:auth");
  }
});

test("neighbouring n8n routes keep the session gate", async () => {
  const guarded = [
    "/api/integrations/n8n",
    "/api/integrations/n8n/admin/overview",
    "/api/integrations/n8n/tiktok",
    "/api/integrations/n8n/tiktok/run/extra",
    "/api/integrations/n8n/tiktok/run/",
    "/api/integrations/n8n/growth",
    "/api/integrations/n8n/growth/report/",
    "/api/integrations/n8n/growth/report/extra",
    "/api/integrations/tiktok/queue",
    "/api/integrations/tiktok/status",
  ];
  for (const path of guarded) {
    const response = await call(path, "POST");
    assert.equal(response.status, 401, `${path} must stay behind the session gate`);
  }
});

test("nothing else in the API opened up with this change", async () => {
  const guarded = [
    "/api/admin/users",
    "/api/admin/migrate/extra",
    "/api/mcp/keys",
    "/api/files/upload",
    "/api/history",
    "/api/agents",
    "/api/agents/heartbeat/extra",
    "/api/settings",
  ];
  for (const path of guarded) {
    const response = await call(path, "POST");
    assert.notEqual(passes(response), true, `${path} must not be passed through`);
  }
});

test("a signed-in user is unaffected, and a real session still wins on the target", async () => {
  getToken.mockResolvedValue({ email: "owner@zooka-ai.com", sub: "u1" });
  const response = await call(TARGET, "POST");
  assert.equal(passes(response), true);
});

test("the machine exemptions that already existed are unchanged", async () => {
  // These predate this change and are listed so a future reader can see that the
  // n8n doorway is not the first, and that each of them authenticates itself.
  const exempt = [
    "/api/webhooks/n8n", // provider signature or shared secret inside the route
    "/api/publish", // workspace bearer key, not a browser session
    "/api/leads/ingest", // x-leads-key
    "/api/stripe/webhook", // Stripe signature
  ];
  for (const path of exempt) {
    const response = await call(path, "POST");
    assert.equal(passes(response), true, `${path} is a documented machine exemption`);
  }
});

test("the growth report is a POST-only doorway, like the scheduler", async () => {
  const REPORT = "/api/integrations/n8n/growth/report";
  const response = await call(REPORT, "POST", { "x-n8n-secret": "whatever" });
  assert.equal(passes(response), true, "the request must reach the route, which checks the secret");
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
    const other = await call(REPORT, method);
    assert.equal(other.status, 401, `${method} must not be exempted`);
  }
});
