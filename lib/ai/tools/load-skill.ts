import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { getWorkspaceSkillByName, listWorkspaceSkills } from "@/lib/db/skills";
import { runAfterResponseInTenant } from "@/lib/db/tenant-client";

export async function workspaceSkillsPrompt(organizationId: string): Promise<string> {
  let skills: Awaited<ReturnType<typeof listWorkspaceSkills>>;
  try {
    skills = (await listWorkspaceSkills(organizationId)).filter((skill) => skill.enabled);
  } catch {
    // Skills are optional context. If the table is unavailable (for example, the release
    // migration has not been applied yet) the chat must still answer, just without skills.
    return "";
  }
  if (skills.length === 0) return "";
  return `\n\nAvailable workspace skills (use load_skill to read instructions when relevant):\n${JSON.stringify(
    skills.map(({ name, description }) => ({ name, description }))
  )}`;
}

export async function loadWorkspaceSkill(organizationId: string, name: string) {
  const skill = await getWorkspaceSkillByName(organizationId, name);
  if (!skill?.enabled) return { error: "skill_not_found" as const };
  return { name: skill.name, instructions: skill.instructions };
}

export function createLoadSkill(organizationId: string, userId: string) {
  return tool({
    description: "Load the instructions for an enabled skill in this workspace by its exact name.",
    inputSchema: z.object({ name: z.string().min(1) }),
    execute: ({ name }) =>
      runAfterResponseInTenant({ organizationId, userId }, () =>
        loadWorkspaceSkill(organizationId, name)
      ),
  });
}
