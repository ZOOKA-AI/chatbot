import "server-only";

type Snapshot = { name: string; instructions: string };

export function parseSkillSnapshot(evidence: unknown): Snapshot | null {
  if (typeof evidence !== "string") return null;
  try {
    const value = JSON.parse(evidence);
    if (value?.tool !== "load_skill" || typeof value.result?.name !== "string" ||
        typeof value.result?.instructions !== "string") return null;
    return { name: value.result.name, instructions: value.result.instructions };
  } catch {
    return null;
  }
}

export function completedSkillSnapshot(
  task: { status: string; evidence?: unknown },
  execution: { tool?: string | null; status: string } | null
): Snapshot | null {
  if (task.status !== "completed" || execution?.status !== "succeeded" || execution.tool !== "load_skill") {
    return null;
  }
  return parseSkillSnapshot(task.evidence);
}
