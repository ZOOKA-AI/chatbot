import { describe, expect, it } from "vitest";
import {
  implementedConnectionIds,
  isStudioSection,
  parseLocalProjects,
  starterTemplates,
} from "@/lib/studio";

describe("studio review", () => {
  it("accepts only defined pages", () => {
    expect(isStudioSection("code")).toBe(true);
    expect(isStudioSection("integrations")).toBe(true);
    expect(isStudioSection("../../settings")).toBe(false);
  });
  it("handles corrupt, absent, and wrong-shaped local data", () => {
    for (const value of [
      null,
      "{broken",
      "null",
      "{}",
      "[null,{},12]",
      '[{"id":"a"}]',
    ]) {
      expect(parseLocalProjects(value)).toEqual([]);
    }
  });
  it("preserves valid local projects without treating partial records as projects", () => {
    const project = {
      id: "one",
      name: "موقعي",
      html: "<h1>أهلاً</h1>",
      updatedAt: "2026-10-31T18:00:00Z",
    };
    expect(
      parseLocalProjects(JSON.stringify([null, project, { id: "two" }])),
    ).toEqual([project]);
  });
  it("ships complete, unique starter documents", () => {
    expect(new Set(starterTemplates.map((t) => t.id)).size).toBe(3);
    for (const template of starterTemplates) {
      expect(template.html).toContain('<html lang="ar" dir="rtl">');
      expect(template.html).toContain('name="viewport"');
      expect(template.html).not.toContain("<script");
    }
  });
  it("does not claim social or planned automation connectors exist", () => {
    expect(implementedConnectionIds.has("n8n")).toBe(true);
    for (const id of [
      "whatsapp",
      "instagram",
      "snapchat",
      "tiktok",
      "linkedin",
      "x",
      "make",
      "zapier",
    ]) {
      expect(implementedConnectionIds.has(id)).toBe(false);
    }
  });
});
