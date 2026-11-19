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
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not configured");
  }
  client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

export interface GrantArgs {
  organizationId: string;
  plan: string;
  grantKey: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface GrantResult {
  granted: number;
  skipped: "already_granted" | "no_allowance" | "stale_period" | null;
}

export async function grantTokensForBillingPeriod(
  args: GrantArgs
): Promise<GrantResult> {
  const allowance = PLAN_TOKEN_ALLOWANCE[args.plan] ?? 0;
  if (allowance <= 0) {
    return { granted: 0, skipped: "no_allowance" };
  }

  if (
    !args.periodStart ||
    !args.periodEnd ||
    !Number.isFinite(args.periodStart.getTime()) ||
    !Number.isFinite(args.periodEnd.getTime()) ||
    args.periodEnd <= args.periodStart
  ) {
    throw new Error("A valid billing period is required");
  }
  const periodStart = args.periodStart;
  const q = sql();

  return await q.begin(async (tx) => {
    // Serialize grants for this workspace, including concurrent invoice retries.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${args.organizationId}, 0))`;
    const existing = await tx`
      SELECT 1 FROM token_grants WHERE grant_key = ${args.grantKey} LIMIT 1`;
    if (existing.length > 0) {
      return { granted: 0, skipped: "already_granted" as const };
    }

    const wallets = await tx`
      SELECT period_start FROM token_wallets
      WHERE organization_id = ${args.organizationId} LIMIT 1`;
    const currentStart = wallets[0]?.period_start;
    if (currentStart && new Date(currentStart) >= periodStart) {
      return { granted: 0, skipped: "stale_period" as const };
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
  const q = sql();
  const rows = await q`
    SELECT organization_id, plan, weighted_remaining, period_start, period_end
    FROM token_wallets WHERE organization_id = ${organizationId} LIMIT 1`;
  return rows[0] ?? null;
}

/**
 * بداية ونهاية الفترة الشهرية الحالية (تقويم UTC).
 * تُستخدم حين لا يوجد فاتورة Stripe بعد، مثل مساحات الإطلاق أو الحسابات
 * المجانية الترويجية، كي لا تبقى المحفظة غائبة فتفشل أدوات MCP.
 */
export function currentBillingPeriod(now: Date = new Date()) {
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return { periodEnd, periodStart };
}

/**
 * يضمن وجود محفظة للفترة الحالية بحسب خطة المساحة.
 * آمن للتكرار: قفل استشاري على المساحة + مفتاح منحة واحد لكل (خطة، شهر).
 * لا يجمّد ولا يجمع: المنحة تُنشئ أو تستبدل رصيد الفترة، والتجديد الشهري
 * التالي يستبدله لا يُضيفه. الخطة المجانية لا منحة لها فتبقى بلا محفظة.
 */
export async function ensureWalletForCurrentPeriod(
  organizationId: string,
  plan: string
): Promise<Awaited<ReturnType<typeof readWallet>>> {
  const allowance = PLAN_TOKEN_ALLOWANCE[plan] ?? 0;
  if (allowance <= 0) {
    return await readWallet(organizationId);
  }

  const { periodEnd, periodStart } = currentBillingPeriod();
  const grantKey = `plan:${plan}:${periodStart.toISOString().slice(0, 7)}`;
  const q = sql();

  await q.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`;
    const existing = await tx`
      SELECT 1 FROM token_grants WHERE grant_key = ${grantKey} LIMIT 1`;
    if (existing.length > 0) {
      return;
    }
    await tx`
      INSERT INTO token_grants (organization_id, grant_key, plan, weighted)
      VALUES (${organizationId}, ${grantKey}, ${plan}, ${allowance})`;
    await tx`
      INSERT INTO token_wallets
        (organization_id, plan, weighted_remaining, period_start, period_end, updated_at)
      VALUES
        (${organizationId}, ${plan}, ${allowance}, ${periodStart}, ${periodEnd}, now())
      ON CONFLICT (organization_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        weighted_remaining = EXCLUDED.weighted_remaining,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = now()`;
  });

  return await readWallet(organizationId);
}
