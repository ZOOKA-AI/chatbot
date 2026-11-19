import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

/**
 * طابور نشر خاص: يستقبل المحتوى من n8n ويحفظ نتيجته. كل صف يحمل مفتاح
 * تكرار خارجي حتى لا يُنشر المنشور مرتين عند إعادة محاولة n8n.
 */

export type PublishRow = {
  id: string;
  channel: string;
  status: string;
  providerId: string | null;
  error: string | null;
};

export async function enqueuePublish({
  organizationId,
  externalId,
  channel,
  caption,
  mediaUrl,
}: {
  organizationId: string;
  externalId?: string;
  channel: string;
  caption: string;
  mediaUrl?: string;
}): Promise<PublishRow> {
  const rows = (await db.execute<{
    id: string;
    channel: string;
    status: string;
    provider_id: string | null;
    error: string | null;
  }>(sql`
    INSERT INTO publish_post (organization_id, external_id, channel, caption, media_url)
    VALUES (${organizationId}, ${externalId ?? null}, ${channel}, ${caption}, ${mediaUrl ?? null})
    ON CONFLICT (organization_id, external_id) DO UPDATE
      SET updated_at = now()
    RETURNING id, channel, status, provider_id, error
  `)) as unknown as {
    id: string;
    channel: string;
    status: string;
    provider_id: string | null;
    error: string | null;
  }[];
  const row = rows[0];
  return {
    channel: row.channel,
    error: row.error,
    id: row.id,
    providerId: row.provider_id,
    status: row.status,
  };
}

export async function settlePublish({
  id,
  status,
  providerId,
  error,
}: {
  id: string;
  status: "sent" | "failed";
  providerId?: string;
  error?: string;
}): Promise<void> {
  await db.execute(sql`
    UPDATE publish_post
    SET status = ${status},
        provider_id = ${providerId ?? null},
        error = ${error ?? null},
        updated_at = now()
    WHERE id = ${id}`);
}

export async function listRecentPublishes(
  organizationId: string,
  limit = 20
): Promise<(PublishRow & { createdAt: string })[]> {
  const rows = (await db.execute<{
    id: string;
    channel: string;
    status: string;
    provider_id: string | null;
    error: string | null;
    created_at: string;
  }>(sql`
    SELECT id, channel, status, provider_id, error, created_at
    FROM publish_post
    WHERE organization_id = ${organizationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)) as unknown as {
    id: string;
    channel: string;
    status: string;
    provider_id: string | null;
    error: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    channel: row.channel,
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    providerId: row.provider_id,
    status: row.status,
  }));
}
