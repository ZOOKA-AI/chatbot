import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { agentChannel } from "@/lib/db/schema";
import type { ChannelProvider } from "@/lib/agent/channels/providers";

async function tableExists() {
  const [row] = await db.select({
    exists: sql<boolean>`to_regclass('public."AgentChannel"') is not null`,
  }).from(sql`(select 1) as channel_check`);
  return Boolean(row?.exists);
}

export type AgentChannelRow = Omit<typeof agentChannel.$inferSelect, "secretName"> & { secretName: string };

export async function listAgentChannels(organizationId: string): Promise<AgentChannelRow[]> {
  if (!(await tableExists())) {
    return [];
  }
  return db.select().from(agentChannel)
    .where(eq(agentChannel.organizationId, organizationId))
    .orderBy(asc(agentChannel.provider), asc(agentChannel.createdAt));
}

export async function linkAgentChannel(input: {
  organizationId: string;
  provider: ChannelProvider;
  externalId: string;
  displayName: string | null;
  secretName: string;
  createdBy: string;
}): Promise<AgentChannelRow | null> {
  if (!(await tableExists())) {
    return null;
  }
  const [row] = await db.insert(agentChannel).values({
    organizationId: input.organizationId,
    provider: input.provider,
    externalId: input.externalId,
    displayName: input.displayName,
    secretName: input.secretName,
    createdBy: input.createdBy,
  }).onConflictDoUpdate({
    target: [agentChannel.organizationId, agentChannel.provider, agentChannel.externalId],
    set: {
      displayName: input.displayName,
      secretName: input.secretName,
      enabled: true,
      updatedAt: new Date(),
    },
  }).returning();
  return row ?? null;
}

export async function unlinkAgentChannel(organizationId: string, id: string): Promise<boolean> {
  if (!(await tableExists())) {
    return false;
  }
  const rows = await db.delete(agentChannel)
    .where(and(eq(agentChannel.organizationId, organizationId), eq(agentChannel.id, id)))
    .returning({ id: agentChannel.id });
  return rows.length > 0;
}

/**
 * Inbound webhooks have no session, so the sender is resolved by the pair the
 * provider gave us. The lookup is deliberately provider-scoped and returns only
 * enabled rows; an unlinked sender is ignored rather than guessed.
 */
export async function findAgentChannelBySender(provider: ChannelProvider, externalId: string): Promise<AgentChannelRow | null> {
  if (!(await tableExists())) {
    return null;
  }
  const [row] = await db.select().from(agentChannel)
    .where(and(eq(agentChannel.provider, provider), eq(agentChannel.externalId, externalId), eq(agentChannel.enabled, true)))
    .limit(1);
  return row ?? null;
}

export async function recordAgentChannelMessage(id: string): Promise<void> {
  if (!(await tableExists())) {
    return;
  }
  await db.update(agentChannel)
    .set({ messageCount: sql`${agentChannel.messageCount} + 1`, lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(agentChannel.id, id));
}
