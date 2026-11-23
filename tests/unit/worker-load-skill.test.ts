import { describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  reported: null as null | { evidence: string },
  instructions: "a".repeat(16000),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/skills", () => ({
  listWorkspaceSkills: async () => [],
  getWorkspaceSkillByName: async (organizationId: string, name: string) =>
    organizationId === "org-a" && name === "writing"
      ? { name, enabled: true, instructions: state.instructions }
      : null,
}));
vi.mock("@/lib/agents/command-center", () => ({
  getTask: async () => ({ status: "running", payload: {} }),
  countExecutions: async () => 0,
  claimTask: async () => ({ ok: true }),
  startExecution: async () => ({ ok: true, execution: { id: "execution-a" } }),
  finishExecution: async () => {},
  reportTask: async (_agent: unknown, input: { evidence: string }) => {
    state.reported = input;
    return true;
  },
  latestExecution: async () => null,
}));
vi.mock("@/lib/agents/worker-lease", () => ({
  HEARTBEAT_MS: 30_000,
  heartbeat: async () => ({ id: "execution-a" }),
  idempotencyKey: () => "key",
  leaseDeadline: () => new Date(),
}));

import { runTask } from "@/lib/agents/worker";
import { toolPayloadFor } from "@/lib/agents/tool-payload";

describe("scheduled load_skill evidence", () => {
  test("returns full instructions but stores an explicit reference", async () => {
    const payload = toolPayloadFor("load_skill", { name: "writing", organizationId: "other" });
    const outcome = await runTask(
      { id: "agent-a", organizationId: "org-a", allowedTools: ["load_skill"] },
      { taskId: "task-a", tool: "load_skill", payload }
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.evidence).toEqual({ name: "writing", instructions: state.instructions });
    expect(state.reported).not.toBeNull();
    const stored = JSON.parse(state.reported!.evidence);
    expect(stored).toEqual({
      tool: "load_skill",
      summary: "Loaded workspace skill instructions.",
      result: {
        name: "writing",
        instructionsStored: false,
        note: "Reload the skill for instructions; they may have changed since this run.",
      },
    });
    expect(state.reported!.evidence).not.toContain(state.instructions.slice(0, 100));
  });
});
