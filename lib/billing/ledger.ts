/**
 * Credit ledger. Every function here takes an explicit organizationId and every statement
 * filters on it, so a caller cannot reach another tenant's money by passing the wrong
 * reservation id.
 *
 * The rules the schema makes structural:
 *   balance      = SUM(amountMinor) over the ledger, never a stored column
 *   a hold        = a negative 'reserve' row tied to a reservation
 *   settle        = release the hold (+estimated) and post the real charge (-actual)
 *   one settlement per reservation, enforced by the status transition, not by a check
 *
 * Concurrency: reserve is a single statement whose INSERT is gated on the balance it just
 * computed, so two concurrent reservations cannot both pass the check and overdraw.
 */
import {
  ALLOW_OVERDRAFT,
  RESERVATION_TTL_SECONDS,
  estimateCostMinor,
} from "./config";

export type SqlClient = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
};

export type ReserveResult =
  | { ok: true; reservationId: string; heldMinor: number; availableMinor: number }
  | {
      ok: false;
      reason: "insufficient_balance" | "unpriced_metric";
      availableMinor: number;
      neededMinor: number;
    };

export async function getBalanceMinor(client: SqlClient, organizationId: string) {
  const { rows } = await client.query<{ balance: string | number }>(
    `select coalesce(sum("amountMinor"), 0)::bigint as balance
       from "CreditLedger" where "organizationId" = $1::uuid`,
    [organizationId]
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function ensureAccount(
  client: SqlClient,
  organizationId: string,
  options: { priceMinor?: number; includedCreditMinor?: number; grantIfNew?: boolean } = {}
) {
  const { rows } = await client.query<{ id: string; created: boolean }>(
    `insert into "BillingAccount" ("organizationId", "priceMinor", "includedCreditMinor")
     values ($1::uuid, coalesce($2::int, 4900), coalesce($3::int, 2000))
     on conflict ("organizationId") do nothing
     returning id, true as created`,
    [organizationId, options.priceMinor ?? null, options.includedCreditMinor ?? null]
  );
  if (rows.length > 0 && options.grantIfNew && options.includedCreditMinor) {
    await grantCredits(client, organizationId, options.includedCreditMinor, "plan:starter", "included credit");
  }
  const existing = await client.query<{ id: string }>(
    `select id from "BillingAccount" where "organizationId" = $1::uuid`,
    [organizationId]
  );
  return { accountId: existing.rows[0]?.id ?? null, created: rows.length > 0 };
}

export async function grantCredits(
  client: SqlClient,
  organizationId: string,
  amountMinor: number,
  ref: string,
  memo = "credit grant"
) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("grant amount must be a positive integer number of fils");
  }
  await client.query(
    `insert into "CreditLedger" ("organizationId", kind, "amountMinor", ref, memo)
     values ($1::uuid, 'grant', $2::int, $3, $4)`,
    [organizationId, amountMinor, ref, memo]
  );
}

/** Reserve in one statement: the insert only fires if the balance covers the estimate. */
export async function reserveCredits(
  client: SqlClient,
  input: { organizationId: string; estimatedMinor: number; ref: string; ttlSeconds?: number; metric?: string; units?: number }
): Promise<ReserveResult> {
  let estimated = input.estimatedMinor;
  if ((!estimated || estimated <= 0) && input.metric) {
    const computed = estimateCostMinor(input.metric, input.units ?? 0);
    if (computed === null) {
      return {
        ok: false,
        reason: "unpriced_metric",
        availableMinor: await getBalanceMinor(client, input.organizationId),
        neededMinor: estimated,
      };
    }
    estimated = computed;
  }
  if (!Number.isInteger(estimated) || estimated <= 0) {
    throw new Error("reservation estimate must be a positive integer number of fils");
  }

  const ttl = input.ttlSeconds ?? RESERVATION_TTL_SECONDS;
  const { rows } = await client.query<{
    reservation_id: string | null;
    available_minor: string | number;
  }>(
    `with bal as (
       select coalesce(sum("amountMinor"), 0)::bigint as available
         from "CreditLedger" where "organizationId" = $1::uuid
     ), ins as (
       insert into "CreditReservation" ("organizationId", ref, "estimatedMinor", status, "expiresAt")
       select $1::uuid, $2, $3::int, 'held', now() + ($4::int::text || ' seconds')::interval
         from bal where bal.available >= $3::int
       returning id, "organizationId", "estimatedMinor"
     ), held as (
       insert into "CreditLedger" ("organizationId", kind, "amountMinor", "reservationId", ref, memo)
       select ins."organizationId", 'reserve', -ins."estimatedMinor", ins.id, $2::varchar, 'reservation hold'
         from ins
       returning 1
     )
     select (select id from ins) as reservation_id, (select available from bal) as available_minor`,
    [input.organizationId, input.ref, estimated, ttl]
  );

  const reservationId = rows[0]?.reservation_id ?? null;
  const available = Number(rows[0]?.available_minor ?? 0);
  if (!reservationId) {
    return { ok: false, reason: "insufficient_balance", availableMinor: available, neededMinor: estimated };
  }
  return { ok: true, reservationId, heldMinor: estimated, availableMinor: available - estimated };
}

/**
 * Settle a hold. The update is the lock: a second settlement of the same reservation finds
 * no 'held' row and returns ok:false instead of charging twice.
 */
export async function settleReservation(
  client: SqlClient,
  input: { organizationId: string; reservationId: string; actualMinor?: number }
) {
  const { rows } = await client.query<{ id: string; estimated: number }>(
    `update "CreditReservation"
        set status = 'settled', "settledMinor" = coalesce($3::int, "estimatedMinor"), "updatedAt" = now()
      where id = $1::uuid and "organizationId" = $2::uuid and status = 'held'
      returning id, "estimatedMinor" as estimated`,
    [input.reservationId, input.organizationId, input.actualMinor ?? null]
  );
  if (rows.length === 0) {
    return { ok: false as const, reason: "not_held" as const };
  }
  const estimated = Number(rows[0].estimated);
  const actual = Math.max(0, Math.min(input.actualMinor ?? estimated, estimated));
  if ((input.actualMinor ?? 0) > estimated && !ALLOW_OVERDRAFT) {
    // Cap at the hold: an execution cannot spend more than it reserved, so a balance can
    // never go negative through settlement.
    await client.query(
      `insert into "CreditLedger" ("organizationId", kind, "amountMinor", "reservationId", ref, memo)
       values ($1::uuid, 'adjust', 0, $2::uuid, null, 'actual exceeded hold, capped')`,
      [input.organizationId, input.reservationId]
    ).catch(() => undefined);
  }
  // Release the hold, then post the real charge: net effect is -actual.
  await client.query(
    `insert into "CreditLedger" ("organizationId", kind, "amountMinor", "reservationId", memo)
     values ($1::uuid, 'release', $2::int, $3::uuid, 'hold released on settle')`,
    [input.organizationId, estimated, input.reservationId]
  );
  if (actual > 0) {
    await client.query(
      `insert into "CreditLedger" ("organizationId", kind, "amountMinor", "reservationId", memo)
       values ($1::uuid, 'settle', $2::int, $3::uuid, 'actual usage')`,
      [input.organizationId, -actual, input.reservationId]
    );
  }
  return { ok: true as const, settledMinor: actual, releasedMinor: estimated - actual };
}

/** Release a hold that was never used, returning exactly what was held. */
export async function releaseReservation(
  client: SqlClient,
  input: { organizationId: string; reservationId: string; reason?: string }
) {
  const { rows } = await client.query<{ estimated: number }>(
    `update "CreditReservation"
        set status = 'released', "updatedAt" = now()
      where id = $1::uuid and "organizationId" = $2::uuid and status = 'held'
      returning "estimatedMinor" as estimated`,
    [input.reservationId, input.organizationId]
  );
  if (rows.length === 0) return { ok: false as const, reason: "not_held" as const };
  const estimated = Number(rows[0].estimated);
  await client.query(
    `insert into "CreditLedger" ("organizationId", kind, "amountMinor", "reservationId", memo)
     values ($1::uuid, 'release', $2::int, $3::uuid, $4)`,
    [input.organizationId, estimated, input.reservationId, input.reason ?? "released unused hold"]
  );
  return { ok: true as const, releasedMinor: estimated };
}

/** Release holds whose worker died. Idempotent, and never touches settled rows. */
export async function sweepExpiredReservations(client: SqlClient, organizationId: string) {
  const { rows } = await client.query<{ id: string; estimated: number }>(
    `select id, "estimatedMinor" as estimated
       from "CreditReservation"
      where "organizationId" = $1::uuid and status = 'held' and "expiresAt" < now()`,
    [organizationId]
  );
  let released = 0;
  for (const row of rows) {
    const result = await releaseReservation(client, {
      organizationId,
      reservationId: row.id,
      reason: "expired hold swept",
    });
    if (result.ok) released += result.releasedMinor;
  }
  return { count: rows.length, releasedMinor: released };
}

export async function recordUsage(
  client: SqlClient,
  input: { organizationId: string; metric: string; units: number; costMinor: number; period?: string }
) {
  const period = input.period ?? new Date().toISOString().slice(0, 7);
  await client.query(
    `insert into "UsageCounter" ("organizationId", period, metric, units, "costMinor")
     values ($1::uuid, $2, $3, $4::bigint, $5::int)
     on conflict ("organizationId", period, metric)
     do update set units = "UsageCounter".units + excluded.units,
                   "costMinor" = "UsageCounter"."costMinor" + excluded."costMinor",
                   "updatedAt" = now()`,
    [input.organizationId, period, input.metric, Math.max(0, Math.trunc(input.units)), Math.max(0, input.costMinor)]
  );
}

export type SubscriptionStatus =
  | { subscribed: false; status: "none"; reason: "no_billing_account" }
  | {
      subscribed: boolean;
      status: string;
      planCode: string;
      priceMinor: number;
      includedCreditMinor: number;
      currency: string;
      balanceMinor: number;
    };

export async function getSubscriptionStatus(
  client: SqlClient,
  organizationId: string
): Promise<SubscriptionStatus> {
  const { rows } = await client.query<{
    status: string;
    plan_code: string;
    price_minor: number;
    included_minor: number;
    currency: string;
  }>(
    `select status, "planCode" as plan_code, "priceMinor" as price_minor,
            "includedCreditMinor" as included_minor, currency
       from "BillingAccount" where "organizationId" = $1::uuid`,
    [organizationId]
  );
  const account = rows[0];
  if (!account) {
    return { subscribed: false as const, status: "none" as const, reason: "no_billing_account" as const };
  }
  const balanceMinor = await getBalanceMinor(client, organizationId);
  return {
    subscribed: account.status === "active",
    status: account.status,
    planCode: account.plan_code,
    priceMinor: Number(account.price_minor),
    includedCreditMinor: Number(account.included_minor),
    currency: account.currency,
    balanceMinor,
  };
}
