import postgres from "postgres";

/**
 * أرصدة التوكنز الموزونة لكل مساحة عمل.
 * باقة المستخدم تحدد السقف الشهري، والتجديد يستبدل الرصيد ولا يجمعه،
 * كي لا يتراكم استهلاك غير مدفوع.
 */

export const PLAN_TOKEN_ALLOWANCE: Record<string, number> = {
  free: 0,
  starter: 3_300_000,
  pro: 1_280_000,
  business: 3_300_000,
};

let client: ReturnType<typeof postgres> | null = null;

function sql() {
  if (client) {
    return client;
  }
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not configured");
  }
  client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

let schemaReady = false;

export async function ensureWalletSchema() {
  if (schemaReady) {
    return;
  }
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS token_wallets (
      organization_id text PRIMARY KEY,
      plan text NOT NULL,
      weighted_remaining bigint NOT NULL DEFAULT 0,
      period_start timestamptz,
      period_end timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await q`
    CREATE TABLE IF NOT EXISTS token_grants (
      id bigserial PRIMARY KEY,
      organization_id text NOT NULL,
      grant_key text NOT NULL UNIQUE,
      plan text NOT NULL,
      weighted bigint NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now()
    )`;
  await q`CREATE INDEX IF NOT EXISTS token_grants_org_idx ON token_grants (organization_id)`;
  schemaReady = true;
}

export type GrantArgs = {
  organizationId: string;
  plan: string;
  grantKey: string;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type GrantResult = {
  granted: number;
  skipped: "already_granted" | "no_allowance" | null;
};

export async function grantTokensForBillingPeriod(
  args: GrantArgs
): Promise<GrantResult> {
  const allowance = PLAN_TOKEN_ALLOWANCE[args.plan] ?? 0;
  if (allowance <= 0) {
    return { granted: 0, skipped: "no_allowance" };
  }

  await ensureWalletSchema();
  const q = sql();

  return await q.begin(async (tx) => {
    const existing = await tx`
      SELECT 1 FROM token_grants WHERE grant_key = ${args.grantKey} LIMIT 1`;
    if (existing.length > 0) {
      return { granted: 0, skipped: "already_granted" as const };
    }

    await tx`
      INSERT INTO token_grants (organization_id, grant_key, plan, weighted)
      VALUES (${args.organizationId}, ${args.grantKey}, ${args.plan}, ${allowance})`;

    await tx`
      INSERT INTO token_wallets
        (organization_id, plan, weighted_remaining, period_start, period_end, updated_at)
      VALUES
        (${args.organizationId}, ${args.plan}, ${allowance}, ${args.periodStart}, ${args.periodEnd}, now())
      ON CONFLICT (organization_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        weighted_remaining = EXCLUDED.weighted_remaining,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = now()`;

    return { granted: allowance, skipped: null };
  });
}

export async function readWallet(organizationId: string) {
  await ensureWalletSchema();
  const q = sql();
  const rows = await q`
    SELECT organization_id, plan, weighted_remaining, period_start, period_end
    FROM token_wallets WHERE organization_id = ${organizationId} LIMIT 1`;
  return rows[0] ?? null;
}
