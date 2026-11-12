import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ensureWalletSchema } from "@/lib/db/token-wallets";

/**
 * خصم ذرّي من محفظة التوكنز الموزونة. لا يُسمح بالخصم الذي يجعل الرصيد سالباً،
 * وهذا هو حدّ الاستخدام الذي يحمي الهامش.
 */

export type ChargeResult = {
  ok: boolean;
  remaining: number | null;
};

export async function chargeWallet({
  organizationId,
  weighted,
}: {
  organizationId: string;
  weighted: number;
}): Promise<ChargeResult> {
  if (!Number.isFinite(weighted) || weighted < 0) {
    return { ok: false, remaining: null };
  }
  await ensureWalletSchema();

  const rows = (await db.execute<{ weighted_remaining: string }>(sql`
    UPDATE token_wallets
    SET weighted_remaining = weighted_remaining - ${weighted}, updated_at = now()
    WHERE organization_id = ${organizationId} AND weighted_remaining >= ${weighted}
    RETURNING weighted_remaining
  `)) as unknown as { weighted_remaining: string }[];

  if (rows.length > 0) {
    return { ok: true, remaining: Number(rows[0].weighted_remaining) };
  }

  const current = (await db.execute<{ weighted_remaining: string }>(sql`
    SELECT weighted_remaining FROM token_wallets
    WHERE organization_id = ${organizationId} LIMIT 1
  `)) as unknown as { weighted_remaining: string }[];

  return {
    ok: false,
    remaining: current[0] ? Number(current[0].weighted_remaining) : null,
  };
}
