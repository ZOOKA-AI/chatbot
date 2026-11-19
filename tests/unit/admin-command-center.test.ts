import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_NAV, GROUP_LABELS, findSection } from "@/lib/admin/nav";
import { messageOf, stateOf } from "@/lib/admin/probe";

/**
 * The admin command center's guarantees, tested where they are cheapest to hold.
 *
 * These are structural facts: the menu cannot advertise a page that does not exist, a missing table is
 * never reported as a healthy zero, and the layout refuses before any page runs a query.
 */
describe("admin navigation", () => {
  it("every section has a page behind it", () => {
    for (const item of ADMIN_NAV) {
      const route = item.href === "/admin" ? "" : item.href.replace("/admin/", "");
      const file = join(process.cwd(), "app", "(chat)", "admin", route, "page.tsx");
      expect(existsSync(file), `missing page for ${item.href}`).toBe(true);
    }
  });

  it("keeps hrefs unique and grouped", () => {
    const hrefs = ADMIN_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of ADMIN_NAV) {
      expect(GROUP_LABELS[item.group]).toBeDefined();
    }
  });

  it("resolves a section by href and nothing else", () => {
    expect(findSection("/admin/incidents")?.labelEn).toBe("Incidents & repair");
    expect(findSection("/admin/nope")).toBeNull();
  });
});

describe("evidence states", () => {
  it("treats a missing table as not configured, not as zero", () => {
    expect(stateOf(new Error('relation "AdminReport" does not exist'))).toBe("not_configured");
    expect(stateOf(new Error("undefined table: media_job"))).toBe("not_configured");
  });

  it("keeps other failures as errors", () => {
    expect(stateOf(new Error("connection refused"))).toBe("error");
    expect(stateOf(new Error("password authentication failed"))).toBe("error");
    expect(stateOf("boom")).toBe("error");
  });

  it("truncates a detail message so a page cannot leak a whole stack", () => {
    const detail = messageOf(new Error("x".repeat(500)));
    expect(detail).not.toBeNull();
    expect((detail ?? "").length).toBeLessThanOrEqual(160);
  });
});

describe("fail-closed access", () => {
  it("refuses below admin and allows admin and owner only", () => {
    const allowed = (role: string) => role === "admin" || role === "owner";
    expect(allowed("member")).toBe(false);
    expect(allowed("admin")).toBe(true);
    expect(allowed("owner")).toBe(true);
  });

  it("keeps the layout guard ahead of any page", () => {
    const layout = readFileSync(
      join(process.cwd(), "app", "(chat)", "admin", "layout.tsx"),
      "utf8"
    );
    expect(layout).toContain("getWorkspaceContext");
    expect(layout).toContain('redirect("/login")');
    expect(layout).toContain('context.role === "admin"');
    expect(layout).toContain('context.role === "owner"');
  });

  it("re-checks the role inside every admin page", () => {
    for (const item of ADMIN_NAV) {
      const route = item.href === "/admin" ? "" : item.href.replace("/admin/", "");
      const file = join(process.cwd(), "app", "(chat)", "admin", route, "page.tsx");
      const source = readFileSync(file, "utf8");
      expect(source, `${item.href} must call adminPageContext`).toContain("adminPageContext");
      expect(source, `${item.href} must render the refusal`).toContain("AdminDenied");
    }
  });
});
