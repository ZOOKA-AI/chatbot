import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_EXEMPT_ROUTES } from "@/lib/db/tenant-exemptions";

const APP_DIR = path.join(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = walk(APP_DIR).map((file) =>
  path.relative(process.cwd(), file).split(path.sep).join("/")
);

const dbTouching = routeFiles.filter((file) =>
  /@\/lib\/db\//.test(readFileSync(path.join(process.cwd(), file), "utf8"))
);

function isWrapped(file: string): boolean {
  return readFileSync(path.join(process.cwd(), file), "utf8").includes(
    "withRequestTenantHandler"
  );
}

describe("tenant context coverage", () => {
  it("finds the database-touching routes it is meant to police", () => {
    expect(dbTouching.length).toBeGreaterThan(20);
  });

  it("wraps every database-touching route that resolves a user session", () => {
    const unguarded = dbTouching.filter(
      (file) => !(isWrapped(file) || file in TENANT_EXEMPT_ROUTES)
    );
    expect(unguarded).toEqual([]);
  });

  it("keeps every exemption justified and pointing at a real file", () => {
    for (const [file, reason] of Object.entries(TENANT_EXEMPT_ROUTES)) {
      expect(reason.length, `${file} needs a written reason`).toBeGreaterThan(20);
      expect(dbTouching, `${file} is exempt but no longer touches the db`).toContain(
        file
      );
      expect(isWrapped(file), `${file} is exempt yet wrapped`).toBe(false);
    }
  });

  it("never falls back to a client-supplied tenant without a scope", () => {
    const offences: string[] = [];
    for (const file of dbTouching) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      if (/searchParams\.get\(\s*["'](organizationId|orgId|workspaceId)["']/.test(source)) {
        offences.push(file);
      }
    }
    expect(offences).toEqual([]);
  });
});
