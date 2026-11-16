/**
 * Payment readiness, sandbox only.
 *
 * There is no provider client here and no key is read from the environment. What exists is
 * the part that is easy to get wrong and expensive to get wrong later: signature
 * verification, idempotency, and the rule that a payment event is the only thing allowed to
 * create credit.
 *
 * A webhook is untrusted input. It is verified before it is parsed for meaning, it is
 * recorded before it is acted on, and acting on it twice must be a no-op.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { grantCredits, type SqlClient } from "./ledger";

export type PaymentEventType =
  | "subscription.paid"
  | "topup.paid"
  | "payment.failed"
  | "refund";

export type PaymentEvent = {
  eventId: string;
  type: PaymentEventType;
  organizationId: string;
  amountMinor: number;
  currency: string;
  providerRef: string;
};

export const PAYMENT_EVENT_TYPES: PaymentEventType[] = [
  "subscription.paid",
  "topup.paid",
  "payment.failed",
  "refund",
];

/** Constant-time comparison. A length mismatch is a rejection, not a crash. */
export function verifySignature(rawBody: string, signature: string | null, secret: string | null) {
  if (!secret) {
    // No configured secret means no verified webhooks. Refusing is the only safe default:
    // otherwise a missing environment variable silently becomes "accept anything".
    return { ok: false as const, code: "secret_not_configured" as const };
  }
  if (!signature) return { ok: false as const, code: "signature_missing" as const };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signature.replace(/^sha256=/, "").trim().toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return { ok: false as const, code: "signature_mismatch" as const };
  return timingSafeEqual(a, b)
    ? { ok: true as const }
    : { ok: false as const, code: "signature_mismatch" as const };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Parse and validate a verified body. Anything malformed is refused with a named code rather
 * than coerced, because a coerced amount is a wrong charge.
 */
export function parsePaymentEvent(rawBody: string) {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false as const, code: "invalid_json" as const };
  }
  const b = body as Record<string, unknown>;
  const type = b.type as PaymentEventType;
  if (!PAYMENT_EVENT_TYPES.includes(type)) {
    return { ok: false as const, code: "unknown_event_type" as const };
  }
  if (!isUuid(b.organization_id)) {
    return { ok: false as const, code: "invalid_organization" as const };
  }
  const amount = Number(b.amount_minor);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false as const, code: "invalid_amount" as const };
  }
  if (typeof b.event_id !== "string" || b.event_id.length === 0 || b.event_id.length > 120) {
    return { ok: false as const, code: "invalid_event_id" as const };
  }
  if (typeof b.provider_ref !== "string" || b.provider_ref.length === 0 || b.provider_ref.length > 160) {
    return { ok: false as const, code: "invalid_provider_ref" as const };
  }
  const currency = typeof b.currency === "string" ? b.currency.toUpperCase() : "AED";
  if (currency !== "AED") {
    return { ok: false as const, code: "unsupported_currency" as const };
  }
  return {
    ok: true as const,
    event: {
      eventId: b.event_id,
      type,
      organizationId: b.organization_id,
      amountMinor: amount,
      currency,
      providerRef: b.provider_ref,
    } satisfies PaymentEvent,
  };
}

export type ApplyResult =
  | { ok: true; duplicate: boolean; creditedMinor: number; status: string }
  | { ok: false; code: "tenant_mismatch" | "unknown_payment" | "event_mismatch" };

/**
 * Apply an already-verified event. Two layers of duplicate protection:
 *   1 the unique (provider, providerRef) row is inserted with on-conflict-do-nothing, so a
 *     redelivered webhook finds an existing row and returns duplicate
 *   2 the ledger grant is keyed by the event id, so even a duplicate row cannot credit twice
 */
export async function applyPaymentEvent(
  client: SqlClient,
  input: { event: PaymentEvent; provider: string }
) {
  const { event, provider } = input;

  const existing = await client.query<{ organizationId: string; kind: string; amountMinor: number; status: string }>(
    `select "organizationId", kind, "amountMinor", status
       from "PaymentTransaction" where provider = $1 and "providerRef" = $2`,
    [provider, event.providerRef]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // A replayed event for another tenant is an attack, not a duplicate.
    if (row.organizationId !== event.organizationId) {
      return { ok: false as const, code: "tenant_mismatch" as const };
    }
    return { ok: true as const, duplicate: true, creditedMinor: 0, status: row.status };
  }

  const kind = event.type === "topup.paid" ? "topup" : event.type === "subscription.paid" ? "subscription" : "refund";
  const status = event.type === "payment.failed" ? "failed" : event.type === "refund" ? "refunded" : "succeeded";

  const inserted = await client.query<{ id: string }>(
    `insert into "PaymentTransaction"
       ("organizationId", provider, "providerRef", kind, "amountMinor", currency, status)
     values ($1::uuid, $2, $3, $4, $5::int, $6, $7)
     on conflict (provider, "providerRef") do nothing
     returning id`,
    [event.organizationId, provider, event.providerRef, kind, event.amountMinor, event.currency, status]
  );
  if (inserted.rows.length === 0) {
    return { ok: true as const, duplicate: true, creditedMinor: 0, status };
  }

  let credited = 0;
  if (event.type === "topup.paid" || event.type === "subscription.paid") {
    await grantCredits(client, event.organizationId, event.amountMinor, `pay:${event.eventId}`, `${event.type} ${event.providerRef}`);
    credited = event.amountMinor;
    if (event.type === "subscription.paid") {
      await client.query(
        `update "BillingAccount"
            set status = 'active',
                "currentPeriodEnd" = now() + interval '1 month',
                "updatedAt" = now()
          where "organizationId" = $1::uuid`,
        [event.organizationId]
      );
    }
  }

  if (event.type === "payment.failed") {
    // Never downgrade a working subscription on a single failed attempt; the caller decides.
    await client.query(
      `update "BillingAccount" set status = 'past_due', "updatedAt" = now()
        where "organizationId" = $1::uuid and status = 'active'`,
      [event.organizationId]
    );
  }

  if (event.type === "refund") {
    // A refund removes credit it granted, keyed by the event so it can only land once.
    await grantCredits(client, event.organizationId, -event.amountMinor, `refund:${event.eventId}`, `refund ${event.providerRef}`)
      .catch(async () => {
        await client.query(
          `insert into "CreditLedger" ("organizationId", kind, "amountMinor", ref, memo)
           values ($1::uuid, 'adjust', $2::int, $3, $4)`,
          [event.organizationId, -event.amountMinor, `refund:${event.eventId}`, `refund ${event.providerRef}`]
        );
      });
  }

  return { ok: true as const, duplicate: false, creditedMinor: credited, status };
}

/** One entry point for a route handler: verify, then parse, then apply. */
export async function handleWebhook(
  client: SqlClient,
  input: { rawBody: string; signature: string | null; secret: string | null; provider?: string }
) {
  const verified = verifySignature(input.rawBody, input.signature, input.secret);
  if (!verified.ok) return { ok: false as const, code: verified.code };
  const parsed = parsePaymentEvent(input.rawBody);
  if (!parsed.ok) return { ok: false as const, code: parsed.code };
  const applied = await applyPaymentEvent(client, {
    event: parsed.event,
    provider: input.provider ?? "sandbox",
  });
  return applied;
}

/** Invoice lookup by provider reference, tenant scoped. */
export async function getReceipt(
  client: SqlClient,
  input: { organizationId: string; providerRef: string; provider?: string }
) {
  const { rows } = await client.query<{
    provider_ref: string;
    kind: string;
    amount_minor: number;
    currency: string;
    status: string;
    receipt_url: string | null;
    created_at: string;
  }>(
    `select "providerRef" as provider_ref, kind, "amountMinor" as amount_minor, currency,
            status, "receiptUrl" as receipt_url, "createdAt" as created_at
       from "PaymentTransaction"
      where "organizationId" = $1::uuid and "providerRef" = $2 and provider = $3`,
    [input.organizationId, input.providerRef, input.provider ?? "sandbox"]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    providerRef: row.provider_ref,
    kind: row.kind,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    status: row.status,
    receiptUrl: row.receipt_url,
    createdAt: row.created_at,
  };
}
