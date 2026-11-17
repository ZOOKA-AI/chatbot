import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Two doors that only look open.
 *
 * B1: MCP key verification happens before any tenant exists, so it must not go
 * through the tenant handle. Under RLS a tenant-scoped SELECT matches nothing and
 * the surrounding catch turns a valid key into "invalid" with no log evidence.
 *
 * B2: the member-scoped policies and app_is_member() resolve auth.uid(), which
 * reads the JWT claim. The application sets app.organization_id and app.user_id;
 * if neither tenant runner publishes the claim, those policies are dead weight and
 * the tables stay readable only because a parallel organisation policy exists.
 *
 * These are source guards on purpose: the behaviour they protect needs a database
 * with RLS enforced by a non-owner role, which the unit suite does not host.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} must exist`).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + signature.length);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("MCP key authentication uses the bootstrap connection", () => {
  const source = read("lib/db/mcp-keys.ts");

  for (const signature of ["export async function verifyMcpKey", "export async function touchMcpKey"]) {
    it(`${signature.replace("export async function ", "")} does not read through the tenant handle`, () => {
      const body = bodyOf(source, signature);
      expect(body).toMatch(/adminDb\(\)/);
      expect(body).not.toMatch(/\bdb\.execute/);
    });
  }

  it("the tenant handle is still used for the tenant-scoped functions", () => {
    const list = bodyOf(source, "export async function listMcpKeys");
    expect(list).toMatch(/\bdb\.execute/);
  });
});

describe("tenant transactions publish the identity claim", () => {
  for (const path of ["lib/db/tenant-client.ts", "lib/db/tenant.ts"]) {
    it(`${path} sets request.jwt.claims for the member policies`, () => {
      const source = read(path);
      expect(source).toContain("request.jwt.claims");
      expect(source).toContain("request.jwt.claim.sub");
      expect(source).toMatch(/role: "authenticated"|role: 'authenticated'/);
    });
  }
});
