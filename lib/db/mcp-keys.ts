import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

/**
 * مفاتيح MCP: النص الصريح يظهر مرة واحدة عند الإنشاء، والمخزَّن هو SHA-256
 * فقط. المفتاح مربوط بمساحة عمل واحدة ولا يرى غير بياناتها.
 */

const TOKEN_PREFIX = "zk_mcp_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type McpKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function createMcpKey({
  organizationId,
  userId,
  name,
}: {
  organizationId: string;
  userId: string;
  name: string;
}): Promise<{ token: string; key: McpKeySummary }> {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
  const rows = (await db.execute<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
  }>(sql`
    INSERT INTO mcp_api_key (organization_id, created_by_user_id, name, key_prefix, key_hash)
    VALUES (${organizationId}, ${userId}, ${name}, ${prefix}, ${hashToken(token)})
    RETURNING id, name, key_prefix, created_at, last_used_at
  `)) as unknown as {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
  }[];
  const row = rows[0];
  return {
    key: {
      createdAt: row.created_at,
      id: row.id,
      lastUsedAt: row.last_used_at,
      name: row.name,
      prefix: row.key_prefix,
    },
    token,
  };
}

export async function listMcpKeys(
  organizationId: string
): Promise<McpKeySummary[]> {
  try {
    const rows = (await db.execute<{
      id: string;
      name: string;
      key_prefix: string;
      created_at: string;
      last_used_at: string | null;
    }>(sql`
      SELECT id, name, key_prefix, created_at, last_used_at
      FROM mcp_api_key
      WHERE organization_id = ${organizationId} AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `)) as unknown as {
      id: string;
      name: string;
      key_prefix: string;
      created_at: string;
      last_used_at: string | null;
    }[];
    return rows.map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      lastUsedAt: row.last_used_at,
      name: row.name,
      prefix: row.key_prefix,
    }));
  } catch {
    return [];
  }
}

export async function revokeMcpKey({
  organizationId,
  id,
}: {
  organizationId: string;
  id: string;
}): Promise<boolean> {
  const rows = (await db.execute<{ id: string }>(sql`
    UPDATE mcp_api_key SET revoked_at = now()
    WHERE id = ${id} AND organization_id = ${organizationId} AND revoked_at IS NULL
    RETURNING id
  `)) as unknown as { id: string }[];
  return rows.length > 0;
}

export type VerifiedMcpKey = {
  keyId: string;
  organizationId: string;
  userId: string | null;
};

export async function verifyMcpKey(
  token: string
): Promise<VerifiedMcpKey | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20) {
    return null;
  }
  try {
    const rows = (await db.execute<{
      id: string;
      organization_id: string;
      created_by_user_id: string | null;
    }>(sql`
      SELECT id, organization_id, created_by_user_id
      FROM mcp_api_key
      WHERE key_hash = ${hashToken(token)} AND revoked_at IS NULL
      LIMIT 1
    `)) as unknown as {
      id: string;
      organization_id: string;
      created_by_user_id: string | null;
    }[];
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      keyId: row.id,
      organizationId: row.organization_id,
      userId: row.created_by_user_id,
    };
  } catch {
    return null;
  }
}

export async function touchMcpKey(keyId: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE mcp_api_key SET last_used_at = now() WHERE id = ${keyId}`);
  } catch {
    // A failed timestamp update must not fail the request.
  }
}
