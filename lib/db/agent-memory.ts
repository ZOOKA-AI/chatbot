import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

/**
 * Durable facts the agent learns about a workspace. Scoped by workspace so two
 * tenants can never read each other's notes. The table comes from migration
 * 0056: this module only reads and writes, it never creates schema, because the
 * application role holds no CREATE privilege.
 */

export type AgentMemory = {
  key: string;
  value: string;
  importance: number;
};

export type SaveMemoryArgs = {
  userId: string;
  organizationId: string;
  key: string;
  value: string;
  importance?: number;
};

export async function saveAgentMemory({
  userId,
  organizationId,
  key,
  value,
  importance = 7,
}: SaveMemoryArgs): Promise<AgentMemory> {
  const rows = (await db.execute<{
    memory_key: string;
    memory_value: string;
    importance: number;
  }>(sql`
    INSERT INTO agent_memory (user_id, organization_id, memory_key, memory_value, importance)
    VALUES (${userId}, ${organizationId}, ${key}, ${value}, ${importance})
    ON CONFLICT (user_id, organization_id, memory_key)
    DO UPDATE SET
      memory_value = excluded.memory_value,
      importance = GREATEST(agent_memory.importance, excluded.importance),
      updated_at = now()
    RETURNING memory_key, memory_value, importance
  `)) as unknown as {
    memory_key: string;
    memory_value: string;
    importance: number;
  }[];
  const row = rows[0];
  return {
    key: row?.memory_key ?? key,
    value: row?.memory_value ?? value,
    importance: row?.importance ?? importance,
  };
}

export async function listAgentMemories({
  organizationId,
  limit = 8,
}: {
  organizationId: string;
  limit?: number;
}): Promise<AgentMemory[]> {
  try {
    const rows = (await db.execute<{
      memory_key: string;
      memory_value: string;
      importance: number;
    }>(sql`
      SELECT memory_key, memory_value, importance
      FROM agent_memory
      WHERE organization_id = ${organizationId}
      ORDER BY importance DESC, updated_at DESC
      LIMIT ${limit}
    `)) as unknown as {
      memory_key: string;
      memory_value: string;
      importance: number;
    }[];
    return rows.map((row) => ({
      key: row.memory_key,
      value: row.memory_value,
      importance: row.importance,
    }));
  } catch {
    // A memory lookup must never break a reply.
    return [];
  }
}

/** Optional keyword recall for a specific question. */
export async function searchAgentMemories({
  organizationId,
  query,
  limit = 6,
}: {
  organizationId: string;
  query: string;
  limit?: number;
}): Promise<AgentMemory[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return listAgentMemories({ limit, organizationId });
  }
  try {
    const rows = (await db.execute<{
      memory_key: string;
      memory_value: string;
      importance: number;
    }>(sql`
      SELECT memory_key, memory_value, importance
      FROM agent_memory
      WHERE organization_id = ${organizationId}
        AND (
          memory_key ILIKE '%' || ${trimmed} || '%'
          OR memory_value ILIKE '%' || ${trimmed} || '%'
        )
      ORDER BY importance DESC, updated_at DESC
      LIMIT ${limit}
    `)) as unknown as {
      memory_key: string;
      memory_value: string;
      importance: number;
    }[];
    if (rows.length > 0) {
      return rows.map((row) => ({
        key: row.memory_key,
        value: row.memory_value,
        importance: row.importance,
      }));
    }
    return await listAgentMemories({ limit, organizationId });
  } catch {
    return [];
  }
}
