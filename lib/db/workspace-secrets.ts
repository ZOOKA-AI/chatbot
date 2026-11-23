import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { workspaceSecret, workspaceSecretSettings } from "@/lib/db/schema";
import { decryptWorkspaceSecret, encryptWorkspaceSecret } from "@/lib/workspace/secrets/crypto";

const metadata = {
  id: workspaceSecret.id,
  organizationId: workspaceSecret.organizationId,
  name: workspaceSecret.name,
  createdBy: workspaceSecret.createdBy,
  createdAt: workspaceSecret.createdAt,
  updatedAt: workspaceSecret.updatedAt,
  lastUsedAt: workspaceSecret.lastUsedAt,
};

async function tableExists(name: "WorkspaceSecret" | "WorkspaceSecretSettings") {
  const [row] = await db.select({
    exists: sql<boolean>`to_regclass(${`"${name}"`}) is not null`,
  }).from(sql`(select 1) as table_check`);
  if (!row) {
    throw new Error(`Unable to check ${name} table`);
  }
  return row.exists;
}

export type WorkspaceSecretMetadata = Omit<typeof workspaceSecret.$inferSelect, "encryptedValue">;
export type CreateWorkspaceSecret = { organizationId: string; name: string; value: string; createdBy: string };

export async function listWorkspaceSecrets(organizationId: string): Promise<WorkspaceSecretMetadata[]> {
  if (!(await tableExists("WorkspaceSecret"))) {
    return [];
  }
  return db.select(metadata).from(workspaceSecret)
    .where(eq(workspaceSecret.organizationId, organizationId)).orderBy(asc(workspaceSecret.name));
}

export async function getWorkspaceSecretMetadata(organizationId: string, name: string): Promise<WorkspaceSecretMetadata | null> {
  if (!(await tableExists("WorkspaceSecret"))) {
    return null;
  }
  const [row] = await db.select(metadata).from(workspaceSecret)
    .where(and(eq(workspaceSecret.organizationId, organizationId), eq(workspaceSecret.name, name))).limit(1);
  return row ?? null;
}

/** Server-side capability only; never expose this value in a response, tool result, or log. */
export async function getWorkspaceSecretValue(organizationId: string, name: string): Promise<string | null> {
  if (!(await tableExists("WorkspaceSecret"))) {
    return null;
  }
  const [row] = await db.select({ encryptedValue: workspaceSecret.encryptedValue }).from(workspaceSecret)
    .where(and(eq(workspaceSecret.organizationId, organizationId), eq(workspaceSecret.name, name))).limit(1);
  if (!row) {
    return null;
  }
  const value = decryptWorkspaceSecret(row.encryptedValue, organizationId, name);
  await db.update(workspaceSecret).set({ lastUsedAt: new Date() })
    .where(and(eq(workspaceSecret.organizationId, organizationId), eq(workspaceSecret.name, name), eq(workspaceSecret.encryptedValue, row.encryptedValue)));
  return value;
}

export async function getWorkspaceSecretDetectionEnabled(organizationId: string): Promise<boolean> {
  if (!(await tableExists("WorkspaceSecretSettings"))) {
    return true;
  }
  const [row] = await db.select({ enabled: workspaceSecretSettings.detectionEnabled }).from(workspaceSecretSettings)
    .where(eq(workspaceSecretSettings.organizationId, organizationId)).limit(1);
  return row?.enabled ?? true;
}

export async function getChatSecretDetectionEnabled(organizationId: string): Promise<boolean> {
  // Avoid aborting a tenant transaction by querying a table that has not been migrated yet.
  return (await tableExists("WorkspaceSecretSettings"))
    ? getWorkspaceSecretDetectionEnabled(organizationId)
    : false;
}

export async function setWorkspaceSecretDetectionEnabled(organizationId: string, enabled: boolean): Promise<void> {
  await db.insert(workspaceSecretSettings).values({ organizationId, detectionEnabled: enabled })
    .onConflictDoUpdate({ target: workspaceSecretSettings.organizationId, set: { detectionEnabled: enabled } });
}

export async function createWorkspaceSecret(input: CreateWorkspaceSecret): Promise<WorkspaceSecretMetadata | null> {
  const encryptedValue = encryptWorkspaceSecret(input.value, input.organizationId, input.name);
  const [row] = await db.insert(workspaceSecret)
    .values({ organizationId: input.organizationId, name: input.name, createdBy: input.createdBy, encryptedValue })
    .onConflictDoNothing({ target: [workspaceSecret.organizationId, workspaceSecret.name] }).returning(metadata);
  return row ?? null;
}

export async function rotateWorkspaceSecret(organizationId: string, name: string, value: string): Promise<WorkspaceSecretMetadata | null> {
  const encryptedValue = encryptWorkspaceSecret(value, organizationId, name);
  const [row] = await db.update(workspaceSecret).set({ encryptedValue, updatedAt: new Date() })
    .where(and(eq(workspaceSecret.organizationId, organizationId), eq(workspaceSecret.name, name))).returning(metadata);
  return row ?? null;
}

export async function deleteWorkspaceSecret(organizationId: string, name: string): Promise<boolean> {
  const rows = await db.delete(workspaceSecret)
    .where(and(eq(workspaceSecret.organizationId, organizationId), eq(workspaceSecret.name, name)))
    .returning({ id: workspaceSecret.id });
  return rows.length > 0;
}
