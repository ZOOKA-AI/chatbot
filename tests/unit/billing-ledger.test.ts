import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import {
  ensureAccount,
  getBalanceMinor,
  getSubscriptionStatus,
  grantCredits,
  recordUsage,
  releaseReservation,
  reserveCredits,
  settleReservation,
  sweepExpiredReservations,
  type SqlClient,
} from "@/lib/billing/ledger";
import { authorizeExecution, finishExecution, previewCost } from "@/lib/billing/guard";
import { STARTER_PLAN, estimateCostMinor, formatAed } from "@/lib/billing/config";

/**
 * Real PostgreSQL (PGlite), real SQL, real transactions. The whole point of this ledger is
 * that a balance cannot go negative and a reservation cannot be spent twice, and neither
 * claim means anything against a mock.
 */
let db: PGlite;
let client: SqlClient;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("lib/db/migrations/pending/0050_billing_ledger.sql", "utf8"));
  client = {
    query: async (text, params = []) => (await db.query(text, params as unknown[])) as never,
  };
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`delete from "UsageCounter"; delete from "CreditLedger"; delete from "CreditReservation"; delete from "BillingAccount"`);
  delete process.env.BILLING_ENFORCEMENT_ENABLED;
});

async function funded(org: string, minor = STARTER_PLAN.includedCreditMinor) {
  const account = await ensureAccount(client, org, {
    priceMinor: STARTER_PLAN.priceMinor,
    includedCreditMinor: minor,
    grantIfNew: true,
  });
  return account;
}

describe("credit ledger", () => {
  test("a new account starts at zero and the included credit is a ledger row, not a column", async () => {
    assert.equal(await getBalanceMinor(client, ORG_A), 0);
    await funded(ORG_A);
    assert.equal(await getBalanceMinor(client, ORG_A), STARTER_PLAN.includedCreditMinor);

    const { rows } = await db.query<{ kind: string; amount: number }>(
      `select kind, "amountMinor" as amount from "CreditLedger" where "organizationId" = $1`,
      [ORG_A]
    );
    assert.deepEqual(rows.map((r) => [r.kind, Number(r.amount)]), [["grant", STARTER_PLAN.includedCreditMinor]]);
  });

  test("reserve holds the estimate and reports the reduced balance", async () => {
    await funded(ORG_A);
    const held = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 500, ref: "exec-1" });
    assert.equal(held.ok, true);
    if (!held.ok) return;
    assert.equal(held.availableMinor, STARTER_PLAN.includedCreditMinor - 500);
    assert.equal(await getBalanceMinor(client, ORG_A), STARTER_PLAN.includedCreditMinor - 500);

    const { rows } = await db.query<{ status: string }>(
      `select status from "CreditReservation" where id = $1`, [held.reservationId]
    );
    assert.equal(rows[0].status, "held");
  });

  test("settle charges the real amount and returns the unused hold", async () => {
    await funded(ORG_A);
    const held = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 500, ref: "exec-2" });
    assert.ok(held.ok);
    if (!held.ok) return;

    const settled = await settleReservation(client, {
      organizationId: ORG_A,
      reservationId: held.reservationId,
      actualMinor: 320,
    });
    assert.equal(settled.ok, true);
    if (!settled.ok) return;
    assert.equal(settled.settledMinor, 320);
    assert.equal(settled.releasedMinor, 180);
    assert.equal(await getBalanceMinor(client, ORG_A), STARTER_PLAN.includedCreditMinor - 320);
  });

  test("a reservation cannot be settled twice", async () => {
    await funded(ORG_A);
    const held = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 400, ref: "exec-3" });
    assert.ok(held.ok);
    if (!held.ok) return;

    const first = await settleReservation(client, { organizationId: ORG_A, reservationId: held.reservationId, actualMinor: 400 });
    assert.equal(first.ok, true);
    const balanceAfterFirst = await getBalanceMinor(client, ORG_A);

    const second = await settleReservation(client, { organizationId: ORG_A, reservationId: held.reservationId, actualMinor: 400 });
    assert.equal(second.ok, false, "second settlement must be refused");
    assert.equal(await getBalanceMinor(client, ORG_A), balanceAfterFirst, "and must not move the balance");
  });

  test("an amount above the balance is refused and nothing is written", async () => {
    await funded(ORG_A, 1000);
    const before = await getBalanceMinor(client, ORG_A);
    const refused = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 5000, ref: "exec-4" });
    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.equal(refused.reason, "insufficient_balance");
    assert.equal(refused.availableMinor, before);
    assert.equal(await getBalanceMinor(client, ORG_A), before);

    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from "CreditReservation"`);
    assert.equal(rows[0].n, 0, "no reservation row may exist after a refusal");
  });

  test("the balance can never go negative, even if actual usage exceeds the hold", async () => {
    await funded(ORG_A, 600);
    const held = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 500, ref: "exec-5" });
    assert.ok(held.ok);
    if (!held.ok) return;

    const settled = await settleReservation(client, {
      organizationId: ORG_A,
      reservationId: held.reservationId,
      actualMinor: 9000,
    });
    assert.equal(settled.ok, true);
    if (!settled.ok) return;
    assert.equal(settled.settledMinor, 500, "charged at most the hold");
    assert.equal(await getBalanceMinor(client, ORG_A), 100);
  });

  test("releasing a hold returns exactly what it held", async () => {
    await funded(ORG_A, 800);
    const held = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 300, ref: "exec-6" });
    assert.ok(held.ok);
    if (!held.ok) return;

    const released = await releaseReservation(client, { organizationId: ORG_A, reservationId: held.reservationId });
    assert.equal(released.ok, true);
    if (!released.ok) return;
    assert.equal(released.releasedMinor, 300);
    assert.equal(await getBalanceMinor(client, ORG_A), 800);
  });

  test("a hold expires and is swept without touching settled rows", async () => {
    await funded(ORG_A, 1000);
    const stale = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 250, ref: "stale", ttlSeconds: -1 });
    assert.ok(stale.ok);
    const done = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 100, ref: "done" });
    assert.ok(done.ok);
    if (!stale.ok || !done.ok) return;
    await settleReservation(client, { organizationId: ORG_A, reservationId: done.reservationId, actualMinor: 100 });

    const swept = await sweepExpiredReservations(client, ORG_A);
    assert.equal(swept.count, 1, "only the expired hold");
    assert.equal(swept.releasedMinor, 250);
    assert.equal(await getBalanceMinor(client, ORG_A), 900);
  });

  test("one tenant cannot settle or release another tenant's reservation", async () => {
    await funded(ORG_A, 1000);
    await funded(ORG_B, 1000);
    const heldA = await reserveCredits(client, { organizationId: ORG_A, estimatedMinor: 400, ref: "cross" });
    assert.ok(heldA.ok);
    if (!heldA.ok) return;

    const stealSettle = await settleReservation(client, {
      organizationId: ORG_B,
      reservationId: heldA.reservationId,
      actualMinor: 400,
    });
    const stealRelease = await releaseReservation(client, {
      organizationId: ORG_B,
      reservationId: heldA.reservationId,
    });
    assert.equal(stealSettle.ok, false);
    assert.equal(stealRelease.ok, false);
    assert.equal(await getBalanceMinor(client, ORG_B), 1000, "the other tenant's balance is untouched");
    assert.equal(await getBalanceMinor(client, ORG_A), 600);

    const { rows } = await db.query<{ status: string }>(
      `select status from "CreditReservation" where id = $1`, [heldA.reservationId]
    );
    assert.equal(rows[0].status, "held", "still exactly as tenant A left it");
  });

  test("usage counters accumulate per month and metric", async () => {
    await funded(ORG_A);
    await recordUsage(client, { organizationId: ORG_A, metric: "model.chat", units: 1200, costMinor: 18, period: "2026-11" });
    await recordUsage(client, { organizationId: ORG_A, metric: "model.chat", units: 800, costMinor: 12, period: "2026-11" });
    const { rows } = await db.query<{ units: number; cost: number }>(
      `select units, "costMinor" as cost from "UsageCounter" where "organizationId" = $1 and period = '2026-11'`,
      [ORG_A]
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].units), 2000);
    assert.equal(Number(rows[0].cost), 30);
  });

  test("subscription status is read from the account, not assumed", async () => {
    const before = await getSubscriptionStatus(client, ORG_A);
    assert.equal(before.subscribed, false);
    if (!("reason" in before)) assert.fail("expected a reason");
    assert.equal(before.reason, "no_billing_account");

    await funded(ORG_A);
    const after = await getSubscriptionStatus(client, ORG_A);
    assert.equal(after.subscribed, true);
    if (!("planCode" in after)) assert.fail("expected plan fields");
    assert.equal(after.planCode, "starter");
    assert.equal(after.priceMinor, STARTER_PLAN.priceMinor);
    assert.equal(after.balanceMinor, STARTER_PLAN.includedCreditMinor);
  });
});

describe("pre-execution guard", () => {
  test("with enforcement off it prices the work and charges nothing", async () => {
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "model.chat", units: 2000, ref: "off" });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.match(decision.message, /will not be charged/);
    assert.equal(decision.estimateMinor, estimateCostMinor("model.chat", 2000));
    assert.equal(await getBalanceMinor(client, ORG_A), 0);
  });

  test("an unpriced metric is refused instead of running unmetered", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    await funded(ORG_A);
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "model.unknown", units: 10, ref: "x" });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.reason, "unpriced_metric");
  });

  test("enforcement without a subscription blocks execution", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "model.chat", units: 1000, ref: "x" });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.reason, "no_subscription");
  });

  test("enforcement with an insufficient balance stops safely and states both numbers", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    await funded(ORG_A, 50);
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "media.image", units: 1000, ref: "x" });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.reason, "insufficient_balance");
    assert.match(decision.message, /Nothing was charged/);
    assert.equal(await getBalanceMinor(client, ORG_A), 50, "the balance is untouched by a refusal");
  });

  test("the full loop: authorize, execute, settle, and the numbers reconcile", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    await funded(ORG_A, 2000);
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "model.chat", units: 4000, ref: "loop" });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.equal(decision.estimateMinor, 60);
    assert.equal(await getBalanceMinor(client, ORG_A), 2000 - 60, "held while running");

    const finished = await finishExecution(client, {
      organizationId: ORG_A,
      reservationId: decision.reservationId,
      metric: "model.chat",
      units: 3000,
    });
    assert.equal(finished.chargedMinor, 45, "charged for the tokens actually used");
    assert.equal(finished.releasedMinor, 15);
    assert.equal(await getBalanceMinor(client, ORG_A), 2000 - 45);

    const again = await finishExecution(client, {
      organizationId: ORG_A,
      reservationId: decision.reservationId,
      metric: "model.chat",
      units: 3000,
    });
    assert.equal(again.chargedMinor, 0, "closing twice charges once");
    assert.equal(await getBalanceMinor(client, ORG_A), 2000 - 45);
  });

  test("a failed execution releases the whole hold and records no usage", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    await funded(ORG_A, 1000);
    const decision = await authorizeExecution(client, { organizationId: ORG_A, metric: "document.render", units: 1000, ref: "fail" });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;

    const finished = await finishExecution(client, {
      organizationId: ORG_A,
      reservationId: decision.reservationId,
      metric: "document.render",
      units: 0,
      failed: true,
    });
    assert.equal(finished.chargedMinor, 0);
    assert.equal(finished.releasedMinor, decision.estimateMinor);
    assert.equal(await getBalanceMinor(client, ORG_A), 1000);

    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from "UsageCounter"`);
    assert.equal(rows[0].n, 0);
  });

  test("the cost preview shows a real number before the button is pressed", async () => {
    await funded(ORG_A, 200);
    const preview = await previewCost(client, ORG_A, "media.image", 1000);
    assert.equal(preview.estimateMinor, 900);
    assert.equal(preview.estimateLabel, formatAed(900));
    assert.equal(preview.affordable, false);
    assert.equal(preview.balanceLabel, formatAed(200));
  });
});
