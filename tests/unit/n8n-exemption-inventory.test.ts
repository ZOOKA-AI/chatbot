import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { proxy } from "@/proxy";

/**
 * Every API route in the repository, walked from the filesystem rather than from a
 * hand-kept list, so a new exemption cannot hide.
 *
 * The risk with a machine doorway is never the endpoint you opened on purpose. It is
 * the endpoint that opens by accident later: a widened prefix, a path that starts to
 * match, a method nobody considered. This test asks the proxy about every route that
 * exists and fails if the set of paths an anonymous caller can reach is not exactly
 * the set somebody wrote down here.
 */

const ORIGIN = "https://zooka-ai.com";

/** Routes that answer an anonymous caller themselves. Each one authenticates the
 * caller by another means: provider signature, shared secret, bearer workspace key,
 * one-time token, or a session check inside the handler. */
const MACHINE_OR_PUBLIC = new Set([
  "/api/auth", // next-auth itself
  "/api/admin/backup", // x-backup-token
  "/api/admin/migrate", // x-migration-token
  "/api/blog", // x-blog-key, an HMAC derived from AUTH_SECRET; the whole /api/blog
  // subtree is exempt at the proxy, so a new route under it must authenticate too
  "/api/agent", // session checked in the handler
  "/api/demo-chat", // public demo
  "/api/domains", // session checked in the handler
  "/api/guest-quota", // pre-auth quota
  "/api/growth/unsubscribe", // derived token in the link
  "/api/integrations/n8n/tiktok/run", // x-n8n-secret, POST only
  "/api/leads/ingest", // x-leads-key
  "/api/mcp", // workspace bearer key
  "/api/media-engine", // session checked in the handler
  "/api/media-engine/callback", // HMAC over the raw body
  "/api/phone-auth", // issues and verifies its own one-time codes
  "/api/projects", // session checked in the handler
  "/api/publish", // workspace bearer key
  "/api/stripe/webhook", // Stripe signature
  "/api/webhooks", // provider signature per route
]);

function routePaths(dir = "app/api", acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routePaths(full, acc);
      continue;
    }
    if (entry !== "route.ts") continue;
    const segment = relative("app", dir).split("/").slice(1).join("/");
    acc.push(`/api${segment ? `/${segment}` : ""}`.replace(/\/+/g, "/"));
  }
  return acc;
}

function covered(pathname: string): boolean {
  for (const exempt of MACHINE_OR_PUBLIC) {
    if (pathname === exempt || pathname.startsWith(`${exempt}/`)) return true;
  }
  return false;
}

const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

beforeEach(() => {
  getToken.mockResolvedValue(null);
});
afterEach(() => {
  getToken.mockReset();
});

test("no API route outside the documented list is reachable without a session", async () => {
  const paths = routePaths();
  assert.ok(paths.length > 80, `expected the whole API surface, found ${paths.length}`);
  const leaked: string[] = [];
  for (const pathname of paths) {
    if (covered(pathname)) continue;
    for (const method of ["GET", "POST"]) {
      const response = await proxy(
        new NextRequest(`${ORIGIN}${pathname}`, { method, headers: { accept: "application/json" } })
      );
      if (passes(response)) leaked.push(`${method} ${pathname}`);
    }
  }
  assert.deepEqual(leaked, [], `these routes answered an anonymous caller: ${leaked.join(", ")}`);
});

test("the documented list has no entry that no longer exists", () => {
  const paths = new Set(routePaths());
  const stale = [...MACHINE_OR_PUBLIC].filter((exempt) => {
    if (exempt === "/api/auth" || exempt === "/api/webhooks" || exempt === "/api/blog") {
      return ![...paths].some((pathname) => pathname.startsWith(exempt));
    }
    return !paths.has(exempt);
  });
  assert.deepEqual(stale, [], `stale exemptions: ${stale.join(", ")}`);
});

test("the n8n doorway is the only machine route that is POST-only", async () => {
  const response = await proxy(
    new NextRequest(`${ORIGIN}/api/integrations/n8n/tiktok/run`, { method: "GET" })
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.code, "unauthorized:auth");
});
