import { describe, expect, it } from "vitest";
import { providerGuides } from "@/lib/studio-provider-guides";
import {
  createProjectBackup,
  MAX_HTML_BYTES,
  parseLocalTasks,
  readProjectBackup,
  validateHtmlImport,
} from "@/lib/studio-tools";

const project = {
  id: "one",
  name: "موقعي",
  html: "<h1>أهلاً</h1>",
  updatedAt: "2026-10-31T18:00:00Z",
};
const task = {
  id: "one",
  title: "مراجعة",
  stage: "todo",
  priority: "high",
  dueDate: "2026-11-01",
  createdAt: "2026-10-31T18:00:00Z",
};
describe("local studio tools", () => {
  it("round-trips project backups without executing HTML", () => {
    expect(readProjectBackup(createProjectBackup([project]))).toEqual([
      project,
    ]);
  });
  it("rejects malformed or incompatible backups atomically", () => {
    for (const raw of [
      "broken",
      "null",
      "[]",
      JSON.stringify({ format: "other", version: 1, projects: [] }),
      JSON.stringify({ format: "zooka-studio", version: 2, projects: [] }),
      JSON.stringify({
        format: "zooka-studio",
        version: 1,
        projects: [project, { id: "two" }],
      }),
    ]) {
      expect(() => readProjectBackup(raw)).toThrow();
    }
  });
  it("limits imported names, dates, project count, and HTML bytes", () => {
    for (const p of [
      { ...project, name: "a".repeat(101) },
      { ...project, updatedAt: "not-a-date" },
      { ...project, html: "a".repeat(MAX_HTML_BYTES + 1) },
    ]) {
      expect(() => readProjectBackup(createProjectBackup([p]))).toThrow();
    }
    expect(() =>
      readProjectBackup(createProjectBackup(Array(101).fill(project))),
    ).toThrow();
  });
  it("accepts only bounded nonempty HTML files", () => {
    expect(validateHtmlImport("site.HTML", "<h1>نص</h1>")).toBeNull();
    expect(validateHtmlImport("site.exe", "html")).not.toBeNull();
    expect(validateHtmlImport("site.html", " ")).not.toBeNull();
    expect(
      validateHtmlImport("site.html", "أ".repeat(MAX_HTML_BYTES)),
    ).not.toBeNull();
  });
  it("rejects invalid tasks and duplicate IDs", () => {
    expect(parseLocalTasks(null)).toEqual([]);
    expect(parseLocalTasks("broken")).toEqual([]);
    expect(
      parseLocalTasks(
        JSON.stringify([
          null,
          {},
          task,
          task,
          { ...task, id: "two", stage: "executed" },
          { ...task, id: "three", dueDate: "yesterday" },
        ]),
      ),
    ).toEqual([task]);
  });
  it("provides only HTTPS documented provider requirements, not fake connection status", () => {
    expect(providerGuides.n8n.requirements.join(" ")).toContain(
      "Create an API key",
    );
    expect(providerGuides.whatsapp.auth).toContain("Embedded Signup");
    for (const guide of Object.values(providerGuides)) {
      expect(new URL(guide.source).protocol).toBe("https:");
      expect(guide.requirements.length).toBeGreaterThanOrEqual(3);
    }
  });
});
