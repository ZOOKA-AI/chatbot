import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadSecurityPosture } from "@/lib/security/posture";

describe("security posture", () => {
  it("is empty when the variable is unset or invalid", () => {
    expect(loadSecurityPosture({}).rows).toEqual([]);
    expect(loadSecurityPosture({ SECURITY_POSTURE_JSON: "{not json" }).rows).toEqual([]);
    expect(loadSecurityPosture({ SECURITY_POSTURE_JSON: "[]" }).measuredAt).toBeNull();
  });

  it("keeps valid rows and drops malformed ones", () => {
    const posture = loadSecurityPosture({
      SECURITY_POSTURE_JSON: JSON.stringify({
        measuredAt: "2026-11-20",
        rows: [
          { area: "A", account: "a", state: "measured", detail: "d", measuredAt: "2026-11-19" },
          { area: "B", account: "b", state: "made-up", detail: "d", measuredAt: "2026-11-19" },
        ],
        actions: [{ id: "x", title: "t", why: "w", where: "h" }, { id: "y" }],
        auditReportUrl: "javascript:alert(1)",
      }),
    });
    expect(posture.rows.map((r) => r.area)).toEqual(["A"]);
    expect(posture.actions.map((a) => a.id)).toEqual(["x"]);
    expect(posture.auditReportUrl).toBeNull();
    expect(posture.release).toBeNull();
  });

  it("commits no personal account data to the repository", () => {
    const source = readFileSync("lib/security/posture.ts", "utf8");
    for (const needle of ["@gmail.com", "royal_cleaning", "Galaxy", "MoonPay", "base44.app"]) {
      expect(source).not.toContain(needle);
    }
  });
});
