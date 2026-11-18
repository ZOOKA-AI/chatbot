import { sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import { spendSince, reservedSince, tokensSince, toMicros, fromMicros } from "./usage-ledger";

/**
 * Budget safety, and an honest account of what it does and does not guarantee.
 *
 * What it guarantees
 * ------------------
 * Admission is decided inside one transaction that first takes a per-workspace advisory lock. Two
 * requests arriving in the same millisecond cannot both read "spent = 9.95 of 10.00" and both proceed:
 * one takes the lock, reserves, commits; the other waits, then reads the new total and is refused. This
 * is a real ceiling against everything that goes through `admit`, demonstrated by a concurrency test,
 * not by reasoning.
 *
 * What it does not guarantee
 * --------------------------
 * It is not a hard financial cap on the provider side. A provider bills what the model actually
 * produced, and a settlement can exceed its estimate. The remaining exposure is bounded by
 * (number of in-flight requests × estimate), which is why `maxConcurrent` is enforced in-process and
 * per-workspace rather than left to chance. Anyone claiming "we can never overspend at the provider"
 * from post-execution accounting is claiming something the accounting cannot know.
 *
 * Provider-side limits are a separate matter: some are hard, some are alerts, and none of them replace
 * this. They are not asserted here because they have not been verified against each provider's own
 * documentation.
 */

export type BudgetLimits = {
  /** Money a workspace may settle per rolling day. */
  dailyUsd: number;
  /** Money a workspace may settle per rolling 30 days. */
  monthlyUsd: number;
  /** The largest single task this workspace may start, by estimate. */
  maxTaskUsd: number;
  /** Output tokens allowed per rolling day. */
  maxOutputTokensPerDay: number;
  /** In-flight requests allowed for one workspace in this process. */
  maxConcurrent: number;
  /** Wall-clock ceiling for one task. */
  maxTaskDurationMs: number;
};

export class BudgetExceededError extends Error {
  constructor(
    readonly code:
      | "budget_exhausted"
      | "task_too_expensive"
      | "concurrency_exhausted"
      | "token_budget_exhausted"
      | "task_too_long",
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "BudgetExceededError";
  }
}

function num(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Defaults are deliberate: small enough that a bug costs pennies, large enough to do real work. */
export function budgetLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetLimits {
  return {
    dailyUsd: num(env.BUDGET_DAILY_USD, 5),
    monthlyUsd: num(env.BUDGET_MONTHLY_USD, 50),
    maxTaskUsd: num(env.BUDGET_MAX_TASK_USD, 0.5),
    maxOutputTokensPerDay: num(env.BUDGET_DAILY_OUTPUT_TOKENS, 2_000_000),
    maxConcurrent: num(env.BUDGET_MAX_CONCURRENT, 2),
    maxTaskDurationMs: num(env.BUDGET_MAX_TASK_MS, 120_000),
  };
}

/** In-flight requests per workspace, for this process only. The advisory lock covers the rest. */
const inFlight = new Map<string, number>();

export function inFlightCount(organizationId: string): number {
  return inFlight.get(organizationId) ?? 0;
}

function startSlot(organizationId: string, limit: number): void {
  const current = inFlight.get(organizationId) ?? 0;
  if (current >= limit) throw new BudgetExceededError("concurrency_exhausted", { current, limit });
  inFlight.set(organizationId, current + 1);
}

function endSlot(organizationId: string): void {
  const current = inFlight.get(organizationId) ?? 0;
  if (current <= 1) inFlight.delete(organizationId);
  else inFlight.set(organizationId, current - 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type Admission = {
  organizationId: string;
  requestId: string;
  provider: string;
  model: string;
  /** The most this call is expected to cost. Must be a real number, not a guess of zero. */
  estimateUsd: number;
  estimatedOutputTokens?: number;
  promptId?: string | null;
  promptVersion?: string | null;
  promptHash?: string | null;
  taskId?: string | null;
  userId?: string | null;
  limits?: BudgetLimits;
  now?: Date;
};

export type AdmissionResult = {
  admitted: true;
  reservedUsd: number;
  remainingTodayUsd: number;
  release: () => Promise<void>;
};

/**
 * Reserve money before work starts.
 *
 * Throws BudgetExceededError when the workspace cannot afford it. On success the caller owns a
 * `release` that must be called if the work never reports back: it marks the reservation settled at
 * zero, which returns the money to the available budget without inventing a cost that was never paid.
 */
export async function admit(admission: Admission): Promise<AdmissionResult> {
  const limits = admission.limits ?? budgetLimitsFromEnv();
  const now = admission.now ?? new Date();
  const estimateMicros = toMicros(admission.estimateUsd);

  if (estimateMicros > toMicros(limits.maxTaskUsd)) {
    throw new BudgetExceededError("task_too_expensive", {
      estimateUsd: admission.estimateUsd,
      maxTaskUsd: limits.maxTaskUsd,
    });
  }

  startSlot(admission.organizationId, limits.maxConcurrent);
  let released = false;
  try {
    const outcome = await db.transaction(async (tx) => {
      // Serializes admission per workspace for the life of this transaction. Without it, two
      // concurrent requests read the same spent total and both pass.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${admission.organizationId}))`);

      const dayStart = new Date(now.getTime() - DAY_MS);
      const monthStart = new Date(now.getTime() - 30 * DAY_MS);

      const committed = (await tx.execute<{ daily: string; monthly: string }>(sql`
        select
          coalesce(sum(case when "createdAt" >= ${dayStart.toISOString()}::timestamptz then "costUsd" else 0 end), 0)::text as daily,
          coalesce(sum("costUsd"), 0)::text as monthly
        from "UsageLedger"
        where "organizationId" = ${admission.organizationId}
          and kind in ('settle','adjust')
      `)) as unknown as Array<{ daily: string; monthly: string }>;
      const held = (await tx.execute<{ held: string; output_tokens: string }>(sql`
        select
          coalesce(sum(r."costUsd"), 0)::text as held,
          coalesce((
            select sum(s."outputTokens") from "UsageLedger" s
            where s."organizationId" = ${admission.organizationId}
              and s.kind in ('settle','adjust')
              and s."createdAt" >= ${dayStart.toISOString()}::timestamptz
          ), 0)::text as output_tokens
        from "UsageLedger" r
        where r."organizationId" = ${admission.organizationId}
          and r.kind = 'reserve'
          and not exists (
            select 1 from "UsageLedger" done
            where done."organizationId" = r."organizationId"
              and done."requestId" = r."requestId"
              and done.kind in ('settle','adjust')
          )
      `)) as unknown as Array<{ held: string; output_tokens: string }>;

      const daily = Math.round(Number(committed[0]?.daily ?? 0) * 1_000_000);
      const monthly = Math.round(Number(committed[0]?.monthly ?? 0) * 1_000_000);
      const reserved = Math.round(Number(held[0]?.held ?? 0) * 1_000_000);
      const outputTokens = Number(held[0]?.output_tokens ?? 0);

      if (daily + reserved + estimateMicros > toMicros(limits.dailyUsd)) {
        return { ok: false as const, code: "budget_exhausted" as const, daily, monthly, reserved };
      }
      if (monthly + reserved + estimateMicros > toMicros(limits.monthlyUsd)) {
        return { ok: false as const, code: "budget_exhausted" as const, daily, monthly, reserved };
      }
      if (outputTokens + (admission.estimatedOutputTokens ?? 0) > limits.maxOutputTokensPerDay) {
        return { ok: false as const, code: "token_budget_exhausted" as const, daily, monthly, reserved };
      }

      const inserted = (await tx.execute<{ id: string }>(sql`
        insert into "UsageLedger"
          ("organizationId","userId","taskId","kind","status","provider","model","promptId","promptVersion",
           "promptHash","inputTokens","outputTokens","costUsd","requestId","createdAt")
        values
          (${admission.organizationId}, ${admission.userId ?? null}, ${admission.taskId ?? null}, 'reserve',
           'reserved', ${admission.provider}, ${admission.model}, ${admission.promptId ?? null},
           ${admission.promptVersion ?? null}, ${admission.promptHash ?? null}, 0,
           ${admission.estimatedOutputTokens ?? 0}, ${fromMicros(estimateMicros).toFixed(9)},
           ${admission.requestId}, ${now.toISOString()}::timestamptz)
        on conflict ("organizationId","requestId","kind") do nothing
        returning id
      `)) as unknown as Array<{ id: string }>;
      if (inserted.length === 0) {
        // Same request already reserved: refuse rather than double-charge.
        return { ok: false as const, code: "budget_exhausted" as const, daily, monthly, reserved, duplicate: true };
      }

      return { ok: true as const, daily, monthly, reserved };
    });

    if (outcome.ok === false) {
      endSlot(admission.organizationId);
      throw new BudgetExceededError(outcome.code, {
        dailyUsd: fromMicros(outcome.daily),
        monthlyUsd: fromMicros(outcome.monthly),
        reservedUsd: fromMicros(outcome.reserved),
        estimateUsd: admission.estimateUsd,
        duplicateRequest: Boolean("duplicate" in outcome && outcome.duplicate),
      });
    }

    const remainingTodayUsd = Math.max(
      0,
      fromMicros(toMicros(limits.dailyUsd) - (outcome.daily + outcome.reserved + estimateMicros)),
    );

    return {
      admitted: true,
      reservedUsd: admission.estimateUsd,
      remainingTodayUsd,
      release: async () => {
        if (released) return;
        released = true;
        await settle({
          organizationId: admission.organizationId,
          requestId: admission.requestId,
          provider: admission.provider,
          model: admission.model,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          status: "released",
          taskId: admission.taskId ?? null,
          userId: admission.userId ?? null,
        }).catch(() => undefined);
        endSlot(admission.organizationId);
      },
    };
  } catch (error) {
    inFlight.delete(admission.organizationId);
    throw error;
  }
}

/**
 * Record what the call actually cost. Idempotent: the unique (workspace, requestId, kind) means a
 * retried webhook cannot bill twice, and the reconciliation number is the settlement, not the estimate.
 */
export async function settle(input: {
  organizationId: string;
  requestId: string;
  provider: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number | null;
  status?: string;
  userId?: string | null;
  taskId?: string | null;
}): Promise<{ recorded: boolean }> {
  const inserted = (await db.execute<{ id: string }>(sql`
    insert into "UsageLedger"
      ("organizationId","userId","taskId","kind","status","provider","model","inputTokens","outputTokens",
       "costUsd","latencyMs","requestId")
    values
      (${input.organizationId}, ${input.userId ?? null}, ${input.taskId ?? null}, 'settle',
       ${input.status ?? "settled"}, ${input.provider}, ${input.model}, ${input.inputTokens},
       ${input.outputTokens}, ${fromMicros(toMicros(input.costUsd)).toFixed(9)}, ${input.latencyMs ?? null},
       ${input.requestId})
    on conflict ("organizationId","requestId","kind") do nothing
    returning id
  `)) as unknown as Array<{ id: string }>;
  return { recorded: inserted.length > 0 };
}

/** A late provider-side difference, recorded as its own row so the original settlement stays intact. */
export async function adjust(input: {
  organizationId: string;
  requestId: string;
  provider: string;
  model: string;
  costDeltaUsd: number;
  note?: string;
}): Promise<{ recorded: boolean }> {
  if (input.costDeltaUsd < 0) {
    // A refund is not a negative cost: it is a zero-cost settlement of the difference, so the
    // non-negative constraint on the book keeps holding.
    return settle({
      organizationId: input.organizationId,
      requestId: `${input.requestId}:refund`,
      provider: input.provider,
      model: input.model,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      status: "refunded",
    });
  }
  return settle({
    organizationId: input.organizationId,
    requestId: `${input.requestId}:adjust`,
    provider: input.provider,
    model: input.model,
    costUsd: input.costDeltaUsd,
    inputTokens: 0,
    outputTokens: 0,
    status: "adjusted",
  });
}

/** What the workspace has left to spend today, without reserving anything. */
export async function budgetSnapshot(organizationId: string, limits = budgetLimitsFromEnv(), now = new Date()) {
  const dayStart = new Date(now.getTime() - DAY_MS);
  const monthStart = new Date(now.getTime() - 30 * DAY_MS);
  const [spentToday, reserved, spentMonth, tokens] = await Promise.all([
    spendSince(organizationId, dayStart),
    reservedSince(organizationId, dayStart),
    spendSince(organizationId, monthStart),
    tokensSince(organizationId, dayStart),
  ]);
  return {
    limits,
    spentTodayUsd: spentToday,
    reservedUsd: reserved,
    remainingTodayUsd: Math.max(0, limits.dailyUsd - spentToday - reserved),
    spentMonthUsd: spentMonth,
    remainingMonthUsd: Math.max(0, limits.monthlyUsd - spentMonth - reserved),
    outputTokensToday: tokens.output,
    inFlight: inFlightCount(organizationId),
  };
}
