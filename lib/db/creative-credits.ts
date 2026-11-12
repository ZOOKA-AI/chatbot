import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { chargeWallet } from "@/lib/db/wallet-charge";
import {
  priceForUnit,
  type CreativeKind,
} from "@/lib/saas/creative-pricing";

/**
 * وحدات إبداعية مدفوعة مسبقاً. عند نفادها لا يتوقف المنتج: يُخصم سعر الوحدة
 * من محفظة التوكنز تلقائياً، وهو نفس السعر المشتق من هامش 75%.
 */

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS creative_credits (
      organization_id text PRIMARY KEY,
      image_units integer NOT NULL DEFAULT 0,
      video_units integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  // سجل كل استهلاك: مصدره حزمة أم محفظة، للتدقيق وحساب الهامش لاحقاً.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS creative_usage (
      id bigserial PRIMARY KEY,
      organization_id text NOT NULL,
      kind varchar(16) NOT NULL,
      source varchar(16) NOT NULL,
      weighted_tokens integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  schemaReady = true;
}

export async function grantCreativeUnits({
  organizationId,
  kind,
  units,
}: {
  organizationId: string;
  kind: CreativeKind;
  units: number;
}): Promise<number> {
  await ensureSchema();
  const column = kind === "image" ? "image_units" : "video_units";
  const rows = await db.execute<{ total: number }>(sql`
    INSERT INTO creative_credits (organization_id, ${sql.raw(column)})
    VALUES (${organizationId}, ${units})
    ON CONFLICT (organization_id)
    DO UPDATE SET
      ${sql.raw(column)} = creative_credits.${sql.raw(column)} + ${units},
      updated_at = now()
    RETURNING ${sql.raw(column)} AS total
  `);
  return Number((rows as unknown as { total: number }[])[0]?.total ?? 0);
}

export type ConsumeResult =
  | { ok: true; source: "pack"; remaining: number }
  | { ok: true; source: "wallet"; remainingTokens: number | null }
  | { ok: false; reason: "insufficient" | "wallet_missing" };

export async function consumeCreativeUnit({
  organizationId,
  kind,
}: {
  organizationId: string;
  kind: CreativeKind;
}): Promise<ConsumeResult> {
  await ensureSchema();
  const column = kind === "image" ? "image_units" : "video_units";

  const rows = await db.execute<{ remaining: number }>(sql`
    UPDATE creative_credits
    SET ${sql.raw(column)} = ${sql.raw(column)} - 1, updated_at = now()
    WHERE organization_id = ${organizationId}
      AND ${sql.raw(column)} > 0
    RETURNING ${sql.raw(column)} AS remaining
  `);
  const row = (rows as unknown as { remaining: number }[])[0];
  if (row) {
    await db.execute(sql`
      INSERT INTO creative_usage (organization_id, kind, source)
      VALUES (${organizationId}, ${kind}, 'pack')`);
    return { ok: true, remaining: Number(row.remaining), source: "pack" };
  }

  // نفدت الحزمة: يُخصم سعر الوحدة من المحفظة بدل إيقاف العميل.
  const unit = priceForUnit(kind);
  const charged = await chargeWallet({
    organizationId,
    weighted: unit.weightedTokens,
  });
  if (charged.ok) {
    await db.execute(sql`
      INSERT INTO creative_usage (organization_id, kind, source, weighted_tokens)
      VALUES (${organizationId}, ${kind}, 'wallet', ${unit.weightedTokens})`);
    return { ok: true, remainingTokens: charged.remaining, source: "wallet" };
  }
  return {
    ok: false,
    reason: charged.remaining === null ? "wallet_missing" : "insufficient",
  };
}

export async function readCreativeBalance(
  organizationId: string
): Promise<{ images: number; videos: number }> {
  await ensureSchema();
  const rows = await db.execute<{ image_units: number; video_units: number }>(sql`
    SELECT image_units, video_units FROM creative_credits
    WHERE organization_id = ${organizationId} LIMIT 1
  `);
  const row = (rows as unknown as { image_units: number; video_units: number }[])[0];
  return {
    images: Number(row?.image_units ?? 0),
    videos: Number(row?.video_units ?? 0),
  };
}
