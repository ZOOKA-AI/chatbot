import { describe, expect, it } from "vitest";
import { platformAreas, readinessItems } from "@/lib/platform-navigation";
import { isStudioSection } from "@/lib/studio";

describe("unified product navigation", () => {
  it("uses unique real destinations with readiness labels", () => {
    expect(new Set(platformAreas.map((a) => a.href)).size).toBe(
      platformAreas.length,
    );
    for (const area of platformAreas) {
      expect(area.href.startsWith("/")).toBe(true);
      expect(area.href).not.toContain("#");
      expect(area.arState).toBeTruthy();
      expect(area.enState).toBeTruthy();
      if (area.href.startsWith("/studio/"))
        expect(isStudioSection(area.href.split("/")[2])).toBe(true);
    }
  });
  it("states known limits instead of live status or unsupported security claims", () => {
    expect(readinessItems).toHaveLength(6);
    expect(readinessItems.find((s) => s.en === "Remote browser")?.enState).toBe(
      "Not connected",
    );
    expect(readinessItems.map((s) => s.enDetail).join(" ")).toContain(
      "not a live monitor",
    );
    expect(readinessItems.map((s) => s.enDetail).join(" ")).toContain(
      "unencrypted",
    );
  });
});
