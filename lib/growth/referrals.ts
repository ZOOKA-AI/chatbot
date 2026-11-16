import "server-only";

import { sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";

/**
 * Referral rewards engine.
 *
 * Everything here is server-authored. The client never sends an amount, a
 * userId or a reward kind: the caller is resolved from the session and the
 * values come from GrowthSettings.
 *
 * Points cannot be converted to money or API credit, and nothing in this module
 * writes to Subscription, User, Organization or any billing row.
 */

export type RewardKind =
  | "welcome_registration"
  | "referrer_verified_signup"
  | "referrer_first_task"
  | "member_first_task"
  | "ambassador_bonus";

export type AwardResult =
  | { awarded: true; points: number; idempotentReplay: boolean }
  | { awarded: false; reason: "disabled" | "duplicate" | "budget" | "self" | "error" };

export type GrowthSettings = {
  programEnabled: boolean;
  pointsWelcome: number;
  pointsReferrerVerified: number;
  pointsReferrerFirstTask: number;
  pointsFirstTask: number;
  ambassadorThreshold: number;
  bonusAtTenReferrals: number;
  monthlyBudgetPoints: number;
  emailInvitesEnabled: boolean;
};

const DEFAULTS: GrowthSettings = {
  programEnabled: true,
  pointsWelcome: 20,
  pointsReferrerVerified: 50,
  pointsReferrerFirstTask: 100,
  pointsFirstTask: 30,
  ambassadorThreshold: 5,
  bonusAtTenReferrals: 500,
  monthlyBudgetPoints: 100000,
  emailInvitesEnabled: false,
};

export async function readSettings(): Promise<GrowthSettings> {
  try {
    const rows = (await adminDb().execute(sql`
      SELECT "programEnabled","pointsWelcome","pointsReferrerVerified","pointsReferrerFirstTask",
             "pointsFirstTask","ambassadorThreshold","bonusAtTenReferrals","monthlyBudgetPoints",
             "emailInvitesEnabled"
      FROM "GrowthSettings" WHERE "id" = 'default' LIMIT 1
    `)) as unknown as Array<Record<string, unknown>>;
    const row = rows?.[0];
    if (!row) return DEFAULTS;
    return {
      programEnabled: Boolean(row.programEnabled),
      pointsWelcome: Number(row.pointsWelcome),
      pointsReferrerVerified: Number(row.pointsReferrerVerified),
      pointsReferrerFirstTask: Number(row.pointsReferrerFirstTask),
      pointsFirstTask: Number(row.pointsFirstTask),
      ambassadorThreshold: Number(row.ambassadorThreshold),
      bonusAtTenReferrals: Number(row.bonusAtTenReferrals),
      monthlyBudgetPoints: Number(row.monthlyBudgetPoints),
      emailInvitesEnabled: Boolean(row.emailInvitesEnabled),
    };
  } catch {
    return DEFAULTS;
  }
}

/** Deterministic, human-readable code derived from the account id. */
export function codeForUserId(userId: string): string {
  const compact = userId.replace(/-/g, "").toLowerCase();
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 16; i += 2) {
    const byte = Number.parseInt(compact.slice(i, i + 2), 16);
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const code = codeForUserId(userId);
  try {
    await adminDb().execute(sql`
      INSERT INTO "ReferralProfile" ("userId","code") VALUES (${userId}::uuid, ${code})
      ON CONFLICT ("userId") DO NOTHING
    `);
    const rows = (await adminDb().execute(sql`
      SELECT "code" FROM "ReferralProfile" WHERE "userId" = ${userId}::uuid LIMIT 1
    `)) as unknown as Array<{ code: string }>;
    return rows?.[0]?.code ?? code;
  } catch {
    return code;
  }
}

export async function resolveReferralCode(code: string): Promise<string | null> {
  const clean = code.trim().toLowerCase().slice(0, 24);
  if (!/^[a-z0-9]{4,24}$/.test(clean)) return null;
  try {
    const rows = (await adminDb().execute(sql`
      SELECT "userId"::text AS "userId" FROM "ReferralProfile" WHERE "code" = ${clean} LIMIT 1
    `)) as unknown as Array<{ userId: string }>;
    return rows?.[0]?.userId ?? null;
  } catch {
    return null;
  }
}

async function withinBudget(points: number, ceiling: number): Promise<boolean> {
  const rows = (await adminDb().execute(sql`
    SELECT COALESCE(SUM("points"),0)::int AS total FROM "RewardLedger"
    WHERE "createdAt" >= date_trunc('month', now()) AND "status" <> 'revoked'
  `)) as unknown as Array<{ total: number }>;
  const used = Number(rows?.[0]?.total ?? 0);
  return used + points <= Math.max(0, ceiling);
}

/**
 * Records one reward. Idempotency is enforced by the database: the unique
 * idempotency key means a replay inserts nothing and is reported as a replay
 * rather than a second award.
 */
export async function award(input: {
  userId: string;
  organizationId?: string | null;
  kind: RewardKind;
  points: number;
  idempotencyKey: string;
  referredUserId?: string | null;
  status?: "pending" | "available";
  note?: string;
}): Promise<AwardResult> {
  const settings = await readSettings();
  if (!settings.programEnabled) return { awarded: false, reason: "disabled" };
  if (!Number.isFinite(input.points) || input.points <= 0) return { awarded: false, reason: "error" };

  try {
    if (!(await withinBudget(input.points, settings.monthlyBudgetPoints))) {
      return { awarded: false, reason: "budget" };
    }

    const inserted = (await adminDb().execute(sql`
      INSERT INTO "RewardLedger" ("organizationId","userId","kind","points","status","idempotencyKey","referredUserId","note")
      VALUES (${input.organizationId ?? null}::uuid, ${input.userId}::uuid, ${input.kind}, ${input.points},
              ${input.status ?? "pending"}, ${input.idempotencyKey}, ${input.referredUserId ?? null}::uuid, ${input.note ?? null})
      ON CONFLICT ("idempotencyKey") DO NOTHING
      RETURNING "id"::text AS id
    `)) as unknown as Array<{ id: string }>;

    if (inserted.length === 0) return { awarded: false, reason: "duplicate" };
    return { awarded: true, points: input.points, idempotentReplay: false };
  } catch {
    return { awarded: false, reason: "error" };
  }
}

/** Marks the new member's welcome reward available once the address is verified. */
export async function releasePending(userId: string): Promise<void> {
  try {
    await adminDb().execute(sql`
      UPDATE "RewardLedger" SET "status" = 'available'
      WHERE "userId" = ${userId}::uuid AND "status" = 'pending'
    `);
  } catch {
    /* best effort: a stuck pending row is visible in the dashboard, never a lost account */
  }
}

export type RewardsSummary = {
  code: string;
  availablePoints: number;
  pendingPoints: number;
  revokedPoints: number;
  verifiedReferrals: number;
  ambassador: boolean;
  history: Array<{ kind: string; points: number; status: string; createdAt: string }>;
};

export async function getRewardsSummary(userId: string): Promise<RewardsSummary> {
  const code = await getOrCreateReferralCode(userId);
  const empty: RewardsSummary = {
    code,
    availablePoints: 0,
    pendingPoints: 0,
    revokedPoints: 0,
    verifiedReferrals: 0,
    ambassador: false,
    history: [],
  };
  try {
    const totals = (await adminDb().execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN "status" = 'available' THEN "points" END),0)::int AS available,
        COALESCE(SUM(CASE WHEN "status" = 'pending' THEN "points" END),0)::int AS pending,
        COALESCE(SUM(CASE WHEN "status" = 'revoked' THEN "points" END),0)::int AS revoked,
        COUNT(DISTINCT "referredUserId")::int AS referrals
      FROM "RewardLedger" WHERE "userId" = ${userId}::uuid
    `)) as unknown as Array<Record<string, number>>;
    const row = totals?.[0] ?? {};
    const history = (await adminDb().execute(sql`
      SELECT "kind","points","status","createdAt" FROM "RewardLedger"
      WHERE "userId" = ${userId}::uuid ORDER BY "createdAt" DESC LIMIT 25
    `)) as unknown as Array<{ kind: string; points: number; status: string; createdAt: Date }>;

    const settings = await readSettings();
    const referrals = Number(row.referrals ?? 0);
    return {
      code,
      availablePoints: Number(row.available ?? 0),
      pendingPoints: Number(row.pending ?? 0),
      revokedPoints: Number(row.revoked ?? 0),
      verifiedReferrals: referrals,
      ambassador: referrals >= settings.ambassadorThreshold,
      history: (history ?? []).map((h) => ({
        kind: h.kind,
        points: Number(h.points),
        status: String(h.status),
        createdAt: new Date(h.createdAt).toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}

export function referralLink(code: string, origin = "https://zooka-ai.com"): string {
  return `${origin}/r/${code}`;
}

/**
 * First completed agent task: points for the member, and for whoever referred
 * them. Both awards are idempotent, so a second task never pays twice, and the
 * referrer is resolved from the server-side signup event, never from the client.
 */
export async function awardFirstTask(input: {
  userId: string;
  organizationId: string;
}): Promise<void> {
  const settings = await readSettings();
  if (!settings.programEnabled) return;

  await award({
    userId: input.userId,
    organizationId: input.organizationId,
    kind: "member_first_task",
    points: settings.pointsFirstTask,
    idempotencyKey: `first_task:${input.userId}`,
  });

  try {
    const rows = (await adminDb().execute(sql`
      SELECT "code" FROM "ReferralEvent"
      WHERE "userId" = ${input.userId}::uuid AND "event" = 'signup'
      ORDER BY "createdAt" ASC LIMIT 1
    `)) as unknown as Array<{ code: string }>;
    const code = rows?.[0]?.code;
    if (!code) return;
    const referrerId = await resolveReferralCode(code);
    if (!referrerId || referrerId === input.userId) return;
    await award({
      userId: referrerId,
      organizationId: input.organizationId,
      kind: "referrer_first_task",
      points: settings.pointsReferrerFirstTask,
      idempotencyKey: `referrer_first_task:${input.userId}`,
      referredUserId: input.userId,
    });
  } catch {
    /* rewards are never allowed to fail an agent run */
  }
}
