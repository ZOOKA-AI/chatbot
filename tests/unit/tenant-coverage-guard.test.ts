import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps tenant-context coverage from decaying.
 *
 * Background: the tenant machinery existed for a long time while nothing the
 * application called resolved to it, so row level security was never consulted
 * for a real request. Unit tests on the helpers all passed during that period.
 * This guard is the test that would have caught it: a new database-touching
 * entry point cannot be added without either scoping it or recording why it is
 * exempt.
 */

const DB_MODULES = [
  "@/lib/db/queries",
  "@/lib/db/leads",
  "@/lib/db/mcp-keys",
  "@/lib/db/creative-credits",
  "@/lib/db/agent-memory",
  "@/lib/db/projects",
  "@/lib/db/token-wallets",
  "@/lib/db/wallet-charge",
];

const SCOPE_MARKERS = [
  "withRequestTenantHandler",
  "withTenantPage",
  "withRequestTenantAction",
  "withCommanderTenant",
  "withRequestTenant(",
];

/**
 * Paths reviewed and deliberately allowed to run outside a tenant transaction.
 * The reason is part of the record: an entry without one is a bug, not a decision.
 */
const EXEMPT: Record<string, string> = {
  "app/(auth)/actions.ts":
    "registration and sign-in run before any session or organisation exists",
  "app/(auth)/auth.ts": "Auth.js configuration; reads users by email pre-session",
  "app/(chat)/admin/page.tsx": "owner-gated administration, intentionally cross-tenant",
  "app/admin/referrals/page.tsx": "owner-gated administration, intentionally cross-tenant",
  "app/api/admin/migrate/route.ts": "token-gated schema migration, no tenant scope",
  "app/api/admin/overview/route.ts": "owner-gated platform overview across all tenants",
  "app/api/admin/users/route.ts": "owner-gated user administration across all tenants",
  "app/api/leads/ingest/route.ts": "authenticated by x-leads-key header, no user session",
  "app/api/media-engine/callback/route.ts": "authenticated by HMAC signature, worker callback",
  "app/api/stripe/webhook/route.ts": "authenticated by stripe-signature, must not need a session",
  "app/api/mcp/route.ts": "authenticated by bearer MCP token, tenant comes from the key",
  "app/api/publish/route.ts": "authenticated by bearer publish token, tenant comes from the token",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("tenant context coverage", () => {
  const appFiles = walk("app");
  const touching = appFiles.filter((file) => {
    const source = readFileSync(file, "utf8");
    return DB_MODULES.some((mod) => source.includes(mod));
  });

  it("finds the database-touching entry points", () => {
    expect(touching.length).toBeGreaterThan(20);
  });

  it("scopes every entry point, or records why it is exempt", () => {
    const offenders: string[] = [];

    for (const file of touching) {
      const source = readFileSync(file, "utf8");
      const scoped = SCOPE_MARKERS.some((marker) => source.includes(marker));
      if (scoped) continue;

      const exempt = EXEMPT[file];
      if (exempt && exempt.length > 20) continue;
      offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("keeps a floor on how much is actually scoped", () => {
    const scoped = touching.filter((file) =>
      SCOPE_MARKERS.some((marker) => readFileSync(file, "utf8").includes(marker))
    );
    // Raised deliberately, never lowered to make a build pass.
    expect(scoped.length).toBeGreaterThanOrEqual(30);
  });

  it("does not leave stale exemptions behind", () => {
    const stale = Object.keys(EXEMPT).filter((path) => !touching.includes(path));
    expect(stale).toEqual([]);
  });
});
