import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { ChatbotError, type ErrorCode } from "@/lib/errors";
import { isNavigation, requestIdFrom } from "@/lib/http/request-id";
import { proxy } from "@/proxy";

/**
 * The API boundary as callers experience it.
 *
 * Before this change an unauthenticated call to any session route answered 307
 * to /login. fetch() follows that and returns 200 + the login page's HTML, so
 * client code saw "ok" and then failed to parse JSON. These tests fix the
 * behaviour and, as importantly, pin everything that must NOT change.
 */

const ORIGIN = "https://zooka-ai.com";
const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

function call(path: string, headers: Record<string, string> = {}, method = "GET") {
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method, headers }));
}

beforeEach(() => {
  getToken.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  getToken.mockReset();
});

test("code calling a session route without a session gets 401 JSON, not a login page", async () => {
  for (const path of ["/api/history", "/api/integrations/status", "/api/files/upload", "/api/mcp/keys", "/api/admin/users"]) {
    const response = await call(path, { accept: "application/json" });
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["code", "error", "message", "requestId"]);
    assert.equal(body.error, "unauthorized");
    // The app's client fetchers build a ChatbotError from `code`; an unknown
    // or missing code would throw inside their error handling.
    const asClientError = new ChatbotError(body.code as ErrorCode);
    assert.equal(asClientError.type, "unauthorized");
    assert.equal(asClientError.statusCode, 401);
    assert.equal(body.requestId, response.headers.get("x-request-id"), "the body and the header carry the same id");
  }
  const post = await call("/api/vote", { "content-type": "application/json" }, "POST");
  assert.equal(post.status, 401, "a write with no Accept header is still an API call");
});

test("unchanged: a browser navigating to an API link still lands on the login screen", async () => {
  const navigations: Record<string, string>[] = [
    { "sec-fetch-mode": "navigate", accept: "text/html,application/xhtml+xml" },
    { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
  ];
  for (const headers of navigations) {
    const response = await call("/api/integrations/slack/connect", headers);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `${ORIGIN}/login`);
  }
});

test("unchanged: pages redirect, whatever the client says it accepts", async () => {
  for (const path of ["/workspace/usage", "/settings/integrations", "/admin", "/chat/abc"]) {
    const response = await call(path, { accept: "application/json" });
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `${ORIGIN}/login`);
  }
});

test("unchanged: every route that authenticates itself still reaches its handler", async () => {
  for (const path of [
    "/api/admin/migrate",
    "/api/admin/backup",
    "/api/media-engine",
    "/api/media-engine/callback",
    "/api/domains",
    "/api/agent",
    "/api/projects",
    "/api/demo-chat",
    "/api/webhooks",
    "/api/webhooks/whatsapp",
    "/api/stripe/webhook",
    "/api/leads/ingest",
    "/api/phone-auth",
    "/api/mcp",
    "/api/publish",
    "/api/templates/public-template-token",
    "/api/blog/publish",
    "/api/auth/session",
    "/",
    "/pricing",
    "/blog",
  ]) {
    const response = await call(path, { accept: "application/json" });
    assert.ok(passes(response), `${path} must pass through (got ${response.status})`);
  }
});

test("unchanged: a signed-in caller passes", async () => {
  getToken.mockResolvedValue({ email: "owner@example.test" });
  for (const path of ["/api/history", "/workspace/usage", "/api/agents/tasks"]) {
    assert.ok(passes(await call(path, { accept: "application/json" })), path);
  }
});

test("an agent's bearer key reaches the agent routes; nothing else rides along", async () => {
  const withKey = await call("/api/agents/tasks/claim", { authorization: "Bearer zk_agent_key" }, "POST");
  assert.ok(passes(withKey), "the route, not the proxy, decides whether the key is valid");

  assert.equal((await call("/api/agents/tasks", { accept: "application/json" })).status, 401, "no key, no session");
  assert.equal((await call("/api/agents/tasks", { authorization: "Bearer " })).status, 401, "an empty bearer is not a key");
  assert.equal((await call("/api/agents/tasks", { authorization: "Basic abc" })).status, 401);

  // The bearer exemption is for /api/agents/ only.
  for (const path of ["/api/history", "/api/admin/users", "/api/agentsX/tasks", "/api/files/upload"]) {
    assert.equal((await call(path, { authorization: "Bearer zk_agent_key" })).status, 401, path);
  }
});

test("every agent route authenticates the caller itself", () => {
  // The proxy lets a bearer through unverified, so this is the other half of
  // the contract: a new route under /api/agents that forgets resolveCaller()
  // would be open to anyone who types "Bearer x".
  const root = join(process.cwd(), "app/api/agents");
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") routes.push(full);
    }
  };
  walk(root);
  assert.ok(routes.length >= 9, "the agent routes exist");
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    // Handlers appear in three shapes after the tenant work landed: a plain
    // exported function, an alias of a local handler (POST = handler), or a
    // tenant-scoped wrapper. All three count as "this file exports a handler".
    const handlerExports =
      source.match(
        /export (async )?function (GET|POST|PUT|PATCH|DELETE)|export const (GET|POST|PUT|PATCH|DELETE) =/g
      ) ?? [];
    assert.ok(handlerExports.length > 0, `${file} exports a handler`);

    // The contract is unchanged: a bearer key alone must never be enough, so a
    // handler has to prove the caller itself, or run inside a wrapper that does.
    const resolvesCaller = /await resolveCaller\(request\)/.test(source);
    const wrapped = /with(RequestTenantHandler|CommanderTenant)\(/.test(source);
    // The scheduler keeps its own bearer check (authorize(request) answering 401)
    // because it is called by a worker that holds no session by design.
    const localKeyCheck = /function authorize\(/.test(source) && /status: 401/.test(source);
    assert.ok(
      resolvesCaller || wrapped || localKeyCheck,
      `${file}: a handler must resolve the caller (resolveCaller, a tenant wrapper, or its own key check answering 401)`
    );
  }
});

test("every response carries a request id; a hostile one is replaced, not cleaned", async () => {
  const generated = (await call("/pricing")).headers.get("x-request-id");
  assert.match(String(generated), /^[0-9a-f-]{36}$/);

  const kept = await call("/api/history", { "x-request-id": "client-trace-0001", accept: "application/json" });
  assert.equal(kept.headers.get("x-request-id"), "client-trace-0001");

  for (const hostile of ["short", "a".repeat(65), "id with spaces", "<script>alert(1)</script>", "abc\"def-ghij", "../../etc/passwd"]) {
    const headers = new Headers({ "x-request-id": hostile });
    const id = requestIdFrom(headers);
    assert.notEqual(id, hostile);
    assert.match(id, /^[0-9a-f-]{36}$/);
  }
  const redirect = await call("/workspace", { accept: "text/html" });
  assert.ok(redirect.headers.get("x-request-id"), "redirects carry one too");
});

test("navigation detection", () => {
  assert.equal(isNavigation(new Headers({ "sec-fetch-mode": "navigate" })), true);
  assert.equal(isNavigation(new Headers({ "sec-fetch-mode": "cors", accept: "text/html" })), false, "fetch() asking for HTML is still code");
  assert.equal(isNavigation(new Headers({ accept: "*/*" })), false);
  assert.equal(isNavigation(new Headers()), false);
});

test("the Base44 agent route no longer returns upstream text or config names", () => {
  const source = readFileSync(join(process.cwd(), "app/api/base44/agent/route.ts"), "utf8");
  assert.ok(!/message:\s*error\.message\s*}\s*,\s*\n?\s*{\s*status/.test(source), "error.message must not be in a response body");
  assert.match(source, /{ error: "base44_error", requestId }/);
});
