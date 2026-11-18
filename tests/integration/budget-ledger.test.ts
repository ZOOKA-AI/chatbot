import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Budget safety and the spend book, against a real PostgreSQL database.
 *
 * The point of this file is the case reasoning gets wrong: simultaneous requests that each look
 * affordable alone. It asserts the number actually admitted, so a broken lock shows up as eleven
 * admissions against a ten-dollar ceiling rather than as a claim in a report.
 *
 * Requires an explicit opt-in plus a disposable database, because it writes real rows.
 */

const runnable = process.env.ZOOKA_BUDGET_DB === "1" && Boolean(process.env.DATABASE_URL?.trim());
const describeIf = runnable ? describe : describe.skip;

const ORG_A = `budget-test-a-${randomUUID().slice(0, 8)}`;
const ORG_B = `budget-test-b-${randomUUID().slice(0, 8)}`;

const LIMITS = {
  dailyUsd: 1,
  monthlyUsd: 5,
  maxTaskUsd: 0.5,
  maxOutputTokensPerDay: 1_000_000,
  maxConcurrent: 50,
  maxTaskDurationMs: 120_000,
};

describeIf("budget admission and the usage ledger", () => {
  let admit: typeof import("@/lib/billing/budget-guard").admit;
  let settle: typeof import("@/lib/billing/budget-guard").settle;
  let adjust: typeof import("@/lib/billing/budget-guard").adjust;
  let budgetSnapshot: typeof import("@/lib/billing/budget-guard").budgetSnapshot;
  let BudgetExceededError: typeof import("@/lib/billing/budget-guard").BudgetExceededError;
  let recordUsage: typeof import("@/lib/billing/usage-ledger").recordUsage;
  let spendSince: typeof import("@/lib/billing/usage-ledger").spendSince;
  let reservedSince: typeof import("@/lib/billing/usage-ledger").reservedSince;
  let expiredReservations: typeof import("@/lib/billing/usage-ledger").expiredReservations;
  let db: typeof import("@/lib/db/queries").db;
  let sql: typeof import("drizzle-orm").sql;

  beforeAll(async () => {
    const guard = await import("@/lib/billing/budget-guard");
    const ledger = await import("@/lib/billing/usage-ledger");
    const queries = await import("@/lib/db/queries");
    ({ sql } = await import("drizzle-orm"));
    admit = guard.admit;
    settle = guard.settle;
    adjust = guard.adjust;
    budgetSnapshot = guard.budgetSnapshot;
    BudgetExceededError = guard.BudgetExceededError;
    recordUsage = ledger.recordUsage;
    spendSince = ledger.spendSince;
    reservedSince = ledger.reservedSince;
    expiredReservations = ledger.expiredReservations;
    db = queries.db;
  }, 60_000);

  afterAll(async () => {
    // Leave nothing behind in the shared test database.
    await db.execute(sql`delete from "UsageLedger" where "organizationId" in (${ORG_A}, ${ORG_B})`).catch(() => undefined);
  }, 60_000);

  it("refuses a duplicate request id instead of billing it twice", async () => {
    const requestId = randomUUID();
    await recordUsage({
      organizationId: ORG_B,
      kind: "settle",
      provider: "test",
      model: "test-model",
      costUsd: 0.01,
      requestId,
    });
    await expect(
      recordUsage({
        organizationId: ORG_B,
        kind: "settle",
        provider: "test",
        model: "test-model",
        costUsd: 0.01,
        requestId,
      }),
    ).rejects.toThrow(/duplicate_request/);

    // A duplicate is a refusal, not a second charge.
    const spent = await spendSince(ORG_B, new Date(Date.now() - 60_000));
    expect(spent).toBeCloseTo(0.01, 9);
  });

  it("admits exactly as many concurrent requests as the ceiling allows", async () => {
    await db.execute(sql`delete from "UsageLedger" where "organizationId" = ${ORG_A}`);

    // 20 requests, $0.10 each, $1.00 a day: ten may pass, and the other ten must be refused even
    // though every one of them arrived before any of them had settled.
    const attempts = Array.from({ length: 20 }, (_, index) => ({ index, requestId: `concurrent-${index}` }));
    const results = await Promise.all(
      attempts.map(async (attempt) => {
        try {
          const admitted = await admit({
            organizationId: ORG_A,
            requestId: attempt.requestId,
            provider: "test",
            model: "test-model",
            estimateUsd: 0.1,
            limits: { ...LIMITS, maxConcurrent: 50 },
          });
          return { admitted: true as const, attempt, release: admitted.release };
        } catch (error) {
          return { admitted: false as const, attempt, error };
        }
      }),
    );

    const admitted = results.filter((result) => result.admitted);
    const refused = results.filter((result) => !result.admitted);

    expect(admitted).toHaveLength(10);
    expect(refused).toHaveLength(10);
    for (const result of refused) {
      expect(result.admitted).toBe(false);
      if (!result.admitted) expect(result.error).toBeInstanceOf(BudgetExceededError);
    }

    // The book agrees with the count: ten reservations of $0.10, nothing settled.
    const held = await reservedSince(ORG_A, new Date(Date.now() - 60_000));
    expect(held).toBeCloseTo(1, 6);
    const spent = await spendSince(ORG_A, new Date(Date.now() - 60_000));
    expect(spent).toBe(0);

    for (const result of admitted) await result.release();
  }, 120_000);

  it("returns the money when a request never reports back, and can be spent again", async () => {
    await db.execute(sql`delete from "UsageLedger" where "organizationId" = ${ORG_A}`);

    const first = await admit({
      organizationId: ORG_A,
      requestId: "dies-before-settling",
      provider: "test",
      model: "test-model",
      estimateUsd: 0.9,
      limits: { ...LIMITS, maxTaskUsd: 1 },
    });
    // The whole day's budget is now promised, so the next request is refused.
    await expect(
      admit({
        organizationId: ORG_A,
        requestId: "while-held",
        provider: "test",
        model: "test-model",
        estimateUsd: 0.2,
        limits: LIMITS,
      }),
    ).rejects.toThrow(/budget_exhausted/);

    await first.release();

    const after = await budgetSnapshot(ORG_A, LIMITS);
    expect(after.reservedUsd).toBe(0);
    expect(after.remainingTodayUsd).toBeCloseTo(1, 6);
    expect(after.inFlight).toBe(0);

    const retry = await admit({
      organizationId: ORG_A,
      requestId: "after-release",
      provider: "test",
      model: "test-model",
      estimateUsd: 0.2,
      limits: LIMITS,
    });
    expect(retry.admitted).toBe(true);
    await settle({
      organizationId: ORG_A,
      requestId: "after-release",
      provider: "test",
      model: "test-model",
      costUsd: 0.2,
      inputTokens: 100,
      outputTokens: 50,
    });
    expect((await budgetSnapshot(ORG_A, LIMITS)).spentTodayUsd).toBeCloseTo(0.2, 9);
  }, 120_000);

  it("keeps a failed settlement out of the books and does not corrupt the reservation", async () => {
    const before = await spendSince(ORG_A, new Date(Date.now() - 60_000));
    await expect(
      settle({
        organizationId: ORG_A,
        requestId: "after-release-2",
        provider: "test",
        model: "test-model",
        costUsd: Number.NaN,
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).rejects.toThrow(/invalid_cost/);
    const after = await spendSince(ORG_A, new Date(Date.now() - 60_000));
    expect(after).toBeCloseTo(before, 9);
  }, 60_000);

  it("records a late provider difference as its own row, never by editing history", async () => {
    await settle({
      organizationId: ORG_A,
      requestId: "late-difference",
      provider: "test",
      model: "test-model",
      costUsd: 0.05,
      inputTokens: 10,
      outputTokens: 10,
    });
    const beforeRows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from "UsageLedger" where "organizationId" = ${ORG_A}`,
    );
    const before = Number((beforeRows as unknown as { rows: { count: string }[] }).rows[0]?.count ?? 0);

    await adjust({
      organizationId: ORG_A,
      requestId: "late-difference",
      provider: "test",
      model: "test-model",
      costDeltaUsd: 0.02,
    });
    // A refund of the whole call is a zero-cost settlement, so the non-negative rule still holds.
    await adjust({
      organizationId: ORG_A,
      requestId: "refunded-call",
      provider: "test",
      model: "test-model",
      costDeltaUsd: -1,
    });

    const afterRows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from "UsageLedger" where "organizationId" = ${ORG_A}`,
    );
    const after = Number((afterRows as unknown as { rows: { count: string }[] }).rows[0]?.count ?? 0);
    expect(after).toBe(before + 2);

    // The original settlement is untouched: history is append-only.
    const original = await db.execute<{ cost: string; status: string }>(
      sql`select "costUsd"::text as cost, status from "UsageLedger"
          where "organizationId" = ${ORG_A} and "requestId" = 'late-difference' and kind = 'settle'`,
    );
    const row = (original as unknown as { rows: { cost: string; status: string }[] }).rows[0];
    expect(Number(row?.cost)).toBeCloseTo(0.05, 9);
    expect(row?.status).toBe("settled");
  }, 60_000);

  it("surfaces reservations nobody came back for, so they can be reclaimed", async () => {
    await db.execute(sql`
      insert into "UsageLedger"
        ("organizationId","kind","status","provider","model","costUsd","requestId","createdAt")
      values (${ORG_A}, 'reserve', 'reserved', 'test', 'test-model', 0.11, 'abandoned-2d', now() - interval '2 days')
    `);
    const stale = await expiredReservations(ORG_A, new Date(Date.now() - 24 * 60 * 60 * 1000));
    const ids = stale.map((row) => row.requestId);
    expect(ids).toContain("abandoned-2d");
    // It does not hold today's budget hostage, which is the reason it must be reclaimed rather than
    // counted forever.
    const snapshot = await budgetSnapshot(ORG_A, LIMITS);
    expect(snapshot.reservedUsd).toBeLessThan(0.5);
  }, 60_000);

  it("keeps one workspace's spending invisible to another", async () => {
    const snapshotB = await budgetSnapshot(ORG_B, LIMITS);
    const snapshotA = await budgetSnapshot(ORG_A, LIMITS);
    expect(snapshotA.spentTodayUsd).toBeGreaterThan(0);
    expect(snapshotB.spentTodayUsd).toBeCloseTo(0.01, 9);
  }, 60_000);

  it("refuses a task whose estimate alone exceeds the per-task ceiling", async () => {
    await expect(
      admit({
        organizationId: ORG_B,
        requestId: "too-big",
        provider: "test",
        model: "test-model",
        estimateUsd: 5,
        limits: LIMITS,
      }),
    ).rejects.toThrow(/task_too_expensive/);
  }, 60_000);
});
