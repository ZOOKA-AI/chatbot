import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  skills: [] as Array<{
    organizationId: string;
    name: string;
    description: string;
    instructions: string;
    enabled: boolean;
  }>,
  contexts: [] as Array<{ organizationId: string; userId: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/skills", () => ({
  listWorkspaceSkills: async (organizationId: string) =>
    store.skills.filter((skill) => skill.organizationId === organizationId),
  getWorkspaceSkillByName: async (organizationId: string, name: string) =>
    store.skills.find((skill) => skill.organizationId === organizationId && skill.name === name) ?? null,
}));
vi.mock("@/lib/db/tenant-client", () => ({
  runAfterResponseInTenant: async (
    context: { organizationId: string; userId: string },
    work: () => Promise<unknown>
  ) => {
    store.contexts.push(context);
    return work();
  },
}));

import { createLoadSkill, workspaceSkillsPrompt } from "@/lib/ai/tools/load-skill";
import { loadSkill } from "@/lib/agents/worker-tools/load-skill";

beforeEach(() => {
  store.contexts = [];
  store.skills = [
    { organizationId: "a", name: "shared", description: "Alpha description", instructions: "Alpha instructions", enabled: true },
    { organizationId: "a", name: "disabled", description: "Hidden", instructions: "Hidden instructions", enabled: false },
    { organizationId: "b", name: "shared", description: "Beta description", instructions: "Beta instructions", enabled: true },
    { organizationId: "b", name: "private", description: "Private", instructions: "Private instructions", enabled: true },
  ];
});

describe("workspace skills", () => {
  test("chat offers skills to all tool-capable models, not only agent mode", () => {
    const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");
    expect(source).toMatch(/const skillsPrompt = supportsTools\s*\?/);
    expect(source).toMatch(/\.\.\.\(supportsTools\s*\?\s*\{\s*load_skill:/);
    expect(source).toContain("${skillsPrompt}");
  });

  test("prompt lists only enabled workspace names and descriptions, not instructions", async () => {
    const prompt = await workspaceSkillsPrompt("a");
    expect(prompt).toContain("shared");
    expect(prompt).toContain("Alpha description");
    expect(prompt).not.toContain("instructions\"");
    expect(prompt).not.toContain("Alpha instructions");
    expect(prompt).not.toContain("disabled");
    expect(prompt).not.toContain("Beta description");
    expect(await workspaceSkillsPrompt("empty")).toBe("");
  });

  test("load_skill uses the bound workspace and refuses missing or disabled names", async () => {
    const skillTool = createLoadSkill("a", "user-a");
    const options = { toolCallId: "call", messages: [] };
    expect(await skillTool.execute!({ name: "shared" }, options)).toEqual({
      name: "shared",
      instructions: "Alpha instructions",
    });
    expect(await skillTool.execute!({ name: "private" }, options)).toEqual({ error: "skill_not_found" });
    expect(await skillTool.execute!({ name: "disabled" }, options)).toEqual({ error: "skill_not_found" });
    expect(await skillTool.execute!({ name: "missing" }, options)).toEqual({ error: "skill_not_found" });
    expect(await createLoadSkill("b", "user-b").execute!({ name: "shared" }, options)).toEqual({
      name: "shared",
      instructions: "Beta instructions",
    });
    expect(store.contexts).toEqual([
      { organizationId: "a", userId: "user-a" },
      { organizationId: "a", userId: "user-a" },
      { organizationId: "a", userId: "user-a" },
      { organizationId: "a", userId: "user-a" },
      { organizationId: "b", userId: "user-b" },
    ]);
  });

  test("a skill disabled after listing is no longer loadable", async () => {
    await workspaceSkillsPrompt("a");
    store.skills[0].enabled = false;
    expect(await createLoadSkill("a", "user-a").execute!({ name: "shared" }, { toolCallId: "call", messages: [] }))
      .toEqual({ error: "skill_not_found" });
  });

  test("worker tool reads only the context workspace and refuses disabled or missing skills", async () => {
    const context = {
      organizationId: "a",
      agentId: "agent-a",
      signal: new AbortController().signal,
      fetchImpl: fetch,
      payload: { name: "shared", organizationId: "b" },
    };
    expect(await loadSkill.run(context)).toEqual({
      ok: true,
      summary: "Loaded workspace skill instructions.",
      evidence: { name: "shared", instructions: "Alpha instructions" },
    });
    for (const name of ["private", "disabled", "missing"]) {
      expect(await loadSkill.run({ ...context, payload: { name } })).toMatchObject({
        ok: false,
        error: "skill_not_found",
      });
    }
    expect(await loadSkill.run({ ...context, payload: {} })).toMatchObject({ ok: false, error: "invalid_payload" });
  });
});
