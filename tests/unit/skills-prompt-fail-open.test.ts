import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/tenant-client", () => ({ runAfterResponseInTenant: vi.fn() }));
vi.mock("@/lib/db/skills", () => ({
  listWorkspaceSkills: vi.fn(async () => {
    throw new Error('relation "WorkspaceSkill" does not exist');
  }),
  getWorkspaceSkillByName: vi.fn(),
}));

test("chat keeps working without skills when the skills table is unavailable", async () => {
  const { workspaceSkillsPrompt } = await import("@/lib/ai/tools/load-skill");
  assert.equal(await workspaceSkillsPrompt("00000000-0000-0000-0000-000000000000"), "");
});
