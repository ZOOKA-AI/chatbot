/**
 * Commercial configuration for the UAE launch.
 *
 * Every number here is provisional until the owner approves it, which is why none of them
 * is written into a component: the UI reads this module, so a price change is one edit and
 * no screenshot goes stale. Amounts are integer fils (1 AED = 100 fils); a float never
 * touches money in this codebase.
 *
 * Enforcement is separate from pricing: BILLING_ENFORCEMENT_ENABLED is off by default, so
 * deploying this code measures nothing and charges nobody until the flag is turned on
 * deliberately.
 */

export const CURRENCY = "AED" as const;

function envMinor(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const STARTER_PLAN = {
  code: "starter",
  /** 49.00 AED per month, provisional. */
  priceMinor: envMinor("STARTER_PRICE_MINOR", 4900),
  /** 20.00 AED of usage credit included, provisional. */
  includedCreditMinor: envMinor("STARTER_INCLUDED_CREDIT_MINOR", 2000),
  currency: CURRENCY,
} as const;

/** There is no free plan: an account without a subscription cannot execute. */
export const FREE_PLAN_ENABLED = false;

/**
 * Reservation lifetime. A hold older than this is released by the sweeper so a crashed
 * worker cannot strand a customer's balance forever.
 */
export const RESERVATION_TTL_SECONDS = Number.parseInt(
  process.env.BILLING_RESERVATION_TTL_SECONDS ?? "900",
  10
);

/** Minimum balance below which the customer is warned, in fils (2.00 AED). */
export const LOW_BALANCE_THRESHOLD_MINOR = envMinor("BILLING_LOW_BALANCE_MINOR", 200);

/** Refuse the operation instead of allowing an overdraft. No body can override this. */
export const ALLOW_OVERDRAFT = false;

export function billingEnforcementEnabled() {
  return process.env.BILLING_ENFORCEMENT_ENABLED === "true";
}

export function formatAed(minor: number) {
  return `${(minor / 100).toFixed(2)} AED`;
}

/**
 * Cost estimate for one execution, in fils. Rates are per 1,000 units so that a single
 * token costs a fraction of a fil without ever producing a non-integer amount.
 */
export const COST_RATES: Record<string, { perThousandMinor: number; unit: string }> = {
  "model.chat": { perThousandMinor: 15, unit: "1k tokens" },
  "model.reasoning": { perThousandMinor: 60, unit: "1k tokens" },
  "media.image": { perThousandMinor: 900, unit: "1k images" },
  "document.render": { perThousandMinor: 400, unit: "1k documents" },
};

export function estimateCostMinor(metric: string, units: number) {
  const rate = COST_RATES[metric];
  if (!rate) {
    // An unpriced metric is a refusal, never a free execution.
    return null;
  }
  const safeUnits = Number.isFinite(units) && units > 0 ? units : 0;
  return Math.max(1, Math.ceil((safeUnits * rate.perThousandMinor) / 1000));
}
