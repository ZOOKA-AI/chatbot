import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { ensureAccount, getBalanceMinor, getSubscriptionStatus, type SqlClient } from "@/lib/billing/ledger";
import { handleWebhook, verifySignature, parsePaymentEvent } from "@/lib/billing/payments";

/**
 * Sandbox only: no provider client exists and no key is read. These tests cover the parts
 * that decide whether money is safe once a provider is connected: a webhook that is not
 * signed does nothing, a redelivered webhook credits nothing, and a refund cannot be applied
 * twice or to another tenant.
 */
let db: PGlite;
let client: SqlClient;

const ORG = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const SECRET = "sandbox-webhook-secret-for-tests";

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_id: "evt_1",
    type: "topup.paid",
    organization_id: ORG,
    amount_minor: 1500,
    currency: "AED",
    provider_ref: "pi_1",
    ...over,
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("lib/db/migrations/pending/0050_billing_ledger.sql", "utf8"));
  client = { query: async (t, p = []) => (await db.query(t, p as unknown[])) as never };
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`delete from "UsageCounter"; delete from "CreditLedger"; delete from "CreditReservation"; delete from "PaymentTransaction"; delete from "BillingAccount"`);
});

describe("webhook authenticity", () => {
  test("a signed body verifies and a tampered one does not", () => {
    const raw = body();
    assert.equal(verifySignature(raw, sign(raw), SECRET).ok, true);
    assert.equal(verifySignature(raw + " ", sign(raw), SECRET).ok, false);
    assert.equal(verifySignature(raw, sign(raw, "wrong-secret"), SECRET).ok, false);
    assert.equal(verifySignature(raw, null, SECRET).ok, false);
  });

  test("no configured secret means no verified webhooks, not accept-anything", () => {
    const raw = body();
    const result = verifySignature(raw, sign(raw), null);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "secret_not_configured");
  });

  test("malformed bodies are refused by name instead of coerced", () => {
    assert.equal(parsePaymentEvent("not json").ok, false);
    assert.equal(parsePaymentEvent(body({ organization_id: "org-1" })).ok, false);
    assert.equal(parsePaymentEvent(body({ amount_minor: 0 })).ok, false);
    assert.equal(parsePaymentEvent(body({ amount_minor: 12.5 })).ok, false);
    assert.equal(parsePaymentEvent(body({ type: "charge.now" })).ok, false);
    assert.equal(parsePaymentEvent(body({ currency: "USD" })).ok, false);
  });
});

describe("applying a payment", () => {
  test("a signed top-up credits the wallet exactly once", async () => {
    await ensureAccount(client, ORG, { grantIfNew: false });
    const raw = body();
    const first = await handleWebhook(client, { rawBody: raw, signature: sign(raw), secret: SECRET });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.creditedMinor, 1500);
    assert.equal(await getBalanceMinor(client, ORG), 1500);

    const replay = await handleWebhook(client, { rawBody: raw, signature: sign(raw), secret: SECRET });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.duplicate, true);
    assert.equal(replay.creditedMinor, 0);
    assert.equal(await getBalanceMinor(client, ORG), 1500, "a redelivered webhook credits nothing");
  });

  test("an unsigned request writes nothing at all", async () => {
    const raw = body();
    const refused = await handleWebhook(client, { rawBody: raw, signature: "sha256=deadbeef", secret: SECRET });
    assert.equal(refused.ok, false);
    assert.equal(await getBalanceMinor(client, ORG), 0);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from "PaymentTransaction"`);
    assert.equal(rows[0].n, 0);
  });

  test("a subscription payment activates the account and extends its period", async () => {
    await ensureAccount(client, ORG, { grantIfNew: false });
    await client.query(`update "BillingAccount" set status = 'past_due' where "organizationId" = $1::uuid`, [ORG]);
    const raw = body({ event_id: "evt_sub", provider_ref: "pi_sub", type: "subscription.paid", amount_minor: 4900 });
    const applied = await handleWebhook(client, { rawBody: raw, signature: sign(raw), secret: SECRET });
    assert.equal(applied.ok, true);
    const status = await getSubscriptionStatus(client, ORG);
    assert.equal(status.subscribed, true);
    assert.equal(await getBalanceMinor(client, ORG), 4900);
  });

  test("a failed payment marks the account past_due without granting credit", async () => {
    await ensureAccount(client, ORG, { grantIfNew: false });
    const raw = body({ event_id: "evt_fail", provider_ref: "pi_fail", type: "payment.failed", amount_minor: 4900 });
    const applied = await handleWebhook(client, { rawBody: raw, signature: sign(raw), secret: SECRET });
    assert.equal(applied.ok, true);
    assert.equal(await getBalanceMinor(client, ORG), 0);
    const { rows } = await db.query<{ status: string }>(
      `select status from "BillingAccount" where "organizationId" = $1::uuid`, [ORG]
    );
    assert.equal(rows[0].status, "past_due");
  });

  test("a refund reverses credit once and cannot be replayed", async () => {
    await ensureAccount(client, ORG, { grantIfNew: false });
    const topup = body({ event_id: "evt_t", provider_ref: "pi_t", amount_minor: 2000 });
    await handleWebhook(client, { rawBody: topup, signature: sign(topup), secret: SECRET });
    assert.equal(await getBalanceMinor(client, ORG), 2000);

    const refund = body({ event_id: "evt_r", provider_ref: "pi_r", type: "refund", amount_minor: 800 });
    await handleWebhook(client, { rawBody: refund, signature: sign(refund), secret: SECRET });
    assert.equal(await getBalanceMinor(client, ORG), 1200);

    await handleWebhook(client, { rawBody: refund, signature: sign(refund), secret: SECRET });
    assert.equal(await getBalanceMinor(client, ORG), 1200, "the same refund cannot be applied twice");
  });

  test("a replayed reference pointing at another tenant is refused", async () => {
    await ensureAccount(client, ORG, { grantIfNew: false });
    const raw = body();
    await handleWebhook(client, { rawBody: raw, signature: sign(raw), secret: SECRET });

    const hostile = body({ organization_id: OTHER, event_id: "evt_2" });
    const result = await handleWebhook(client, { rawBody: hostile, signature: sign(hostile), secret: SECRET });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "tenant_mismatch");
    assert.equal(await getBalanceMinor(client, OTHER), 0);
  });
});
