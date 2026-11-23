import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { workspaceSkill } from "@/lib/db/schema";

export type WorkspaceSkill = typeof workspaceSkill.$inferSelect;
export type CreateWorkspaceSkill = {
  organizationId: string;
  name: string;
  description: string;
  instructions: string;
  enabled?: boolean;
  createdBy: string;
};
export type WorkspaceSkillPatch = Partial<Pick<CreateWorkspaceSkill, "name" | "description" | "instructions" | "enabled">>;

export async function listWorkspaceSkills(organizationId: string): Promise<WorkspaceSkill[]> {
  return db.select().from(workspaceSkill)
    .where(eq(workspaceSkill.organizationId, organizationId))
    .orderBy(asc(workspaceSkill.name));
}

export async function getWorkspaceSkillByName(
  organizationId: string,
  name: string
): Promise<WorkspaceSkill | null> {
  const [skill] = await db.select().from(workspaceSkill)
    .where(and(eq(workspaceSkill.organizationId, organizationId), eq(workspaceSkill.name, name)))
    .limit(1);
  return skill ?? null;
}

export async function createWorkspaceSkill(input: CreateWorkspaceSkill): Promise<WorkspaceSkill | null> {
  const [skill] = await db.insert(workspaceSkill).values(input)
    .onConflictDoNothing({ target: [workspaceSkill.organizationId, workspaceSkill.name] })
    .returning();
  return skill ?? null;
}

export async function updateWorkspaceSkill(
  organizationId: string,
  name: string,
  patch: WorkspaceSkillPatch
): Promise<WorkspaceSkill | null> {
  const [skill] = await db.update(workspaceSkill)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(workspaceSkill.organizationId, organizationId), eq(workspaceSkill.name, name)))
    .returning();
  return skill ?? null;
}

export async function deleteWorkspaceSkill(organizationId: string, name: string): Promise<boolean> {
  const rows = await db.delete(workspaceSkill)
    .where(and(eq(workspaceSkill.organizationId, organizationId), eq(workspaceSkill.name, name)))
    .returning({ id: workspaceSkill.id });
  return rows.length > 0;
}
