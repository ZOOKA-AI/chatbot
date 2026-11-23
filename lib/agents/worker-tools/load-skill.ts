import { loadWorkspaceSkill } from "@/lib/ai/tools/load-skill";
import type { WorkerTool } from "@/lib/agents/worker-types";

export const loadSkill: WorkerTool = {
  name: "load_skill",
  description: "Reads the instructions for an enabled skill in this workspace by exact name.",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 1,
  async run({ organizationId, payload, signal }) {
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before it started.", error: "aborted" };
    }
    if (typeof payload.name !== "string" || payload.name.length === 0) {
      return { ok: false, summary: "A skill name is required.", error: "invalid_payload" };
    }
    const skill = await loadWorkspaceSkill(organizationId, payload.name);
    if (skill.error !== undefined) {
      return { ok: false, summary: "The skill is unavailable in this workspace.", error: skill.error };
    }
    return { ok: true, summary: "Loaded workspace skill instructions.", evidence: skill };
  },
};
