/**
 * The pre-execution loop, in the order the owner specified:
 *
 *   1 verify an active subscription
 *   2 estimate the cost of this execution
 *   3 verify the balance covers it
 *   4 reserve that amount atomically
 *   5 execute
 *   6 settle the real usage
 *   7 release whatever was not used
 *   8 leave an auditable ledger trail
 *
 * Steps 1-4 return a decision and nothing else has run yet, so a refusal is free. Steps 6-8
 * are idempotent: calling finish twice charges once.
 *
 * This module is deliberately NOT wired into any route on this branch. Turning billing on is
 * `BILLING_ENFORCEMENT_ENABLED=true` plus a call site, and both are the owner's decision.
 */
import {
  ALLOW_OVERDRAFT,
  LOW_BALANCE_THRESHOLD_MINOR,
  billingEnforcementEnabled,
  estimateCostMinor,
  formatAed,
} from "./config";
import {
  getBalanceMinor,
  getSubscriptionStatus,
  recordUsage,
  releaseReservation,
  reserveCredits,
  settleReservation,
  type SqlClient,
} from "./ledger";

export type ExecutionDecision =
  | { allowed: false; reason: "billing_disabled" | "no_subscription" | "unpriced_metric" | "insufficient_balance"; message: string; estimateMinor?: number; balanceMinor?: number }
  | { allowed: true; reservationId: string; estimateMinor: number; balanceMinor: number; lowBalance: boolean; message: string };

export async function authorizeExecution(
  client: SqlClient,
  input: { organizationId: string; metric: string; units: number; ref: string }
): Promise<ExecutionDecision> {
  // While enforcement is off the loop still computes an estimate so the UI can show it, but
  // it reserves nothing and blocks nothing.
  const estimate = estimateCostMinor(input.metric, input.units);
  if (estimate === null) {
    return {
      allowed: false,
      reason: "unpriced_metric",
      message: `No price is configured for ${input.metric}, so this execution is refused rather than run unmetered.`,
    };
  }

  const subscription = await getSubscriptionStatus(client, input.organizationId);
  if (!billingEnforcementEnabled()) {
    return {
      allowed: true,
      reservationId: "",
      estimateMinor: estimate,
      balanceMinor: "balanceMinor" in subscription ? subscription.balanceMinor : 0,
      lowBalance: false,
      message: `Billing enforcement is off. This execution is estimated at ${formatAed(estimate)} and will not be charged.`,
    };
  }

  if (!subscription.subscribed) {
    return {
      allowed: false,
      reason: "no_subscription",
      estimateMinor: estimate,
      message: "An active subscription is required before any execution.",
    };
  }

  const reserve = await reserveCredits(client, {
    organizationId: input.organizationId,
    estimatedMinor: estimate,
    ref: input.ref,
  });
  if (!reserve.ok) {
    return {
      allowed: false,
      reason: reserve.reason === "unpriced_metric" ? "unpriced_metric" : "insufficient_balance",
      estimateMinor: estimate,
      balanceMinor: reserve.availableMinor,
      message: `This execution needs ${formatAed(reserve.neededMinor)} and the balance is ${formatAed(reserve.availableMinor)}. Nothing was charged. Top up to continue.`,
    };
  }

  return {
    allowed: true,
    reservationId: reserve.reservationId,
    estimateMinor: estimate,
    balanceMinor: reserve.availableMinor,
    lowBalance: reserve.availableMinor <= LOW_BALANCE_THRESHOLD_MINOR,
    message: `Reserved ${formatAed(estimate)}. Remaining balance ${formatAed(reserve.availableMinor)}.`,
  };
}

/**
 * Close a reservation with the real usage. Returns what was charged and what came back, so
 * the caller can show the customer a real number instead of an estimate.
 */
export async function finishExecution(
  client: SqlClient,
  input: {
    organizationId: string;
    reservationId: string;
    metric: string;
    units: number;
    actualMinor?: number;
    failed?: boolean;
  }
) {
  if (!billingEnforcementEnabled() || !input.reservationId) {
    return { chargedMinor: 0, releasedMinor: 0, skipped: true as const };
  }

  if (input.failed) {
    const released = await releaseReservation(client, {
      organizationId: input.organizationId,
      reservationId: input.reservationId,
      reason: "execution failed",
    });
    return {
      chargedMinor: 0,
      releasedMinor: released.ok ? released.releasedMinor : 0,
      skipped: false as const,
    };
  }

  const actual = input.actualMinor ?? estimateCostMinor(input.metric, input.units) ?? 0;
  const settled = await settleReservation(client, {
    organizationId: input.organizationId,
    reservationId: input.reservationId,
    actualMinor: actual,
  });
  if (!settled.ok) {
    return { chargedMinor: 0, releasedMinor: 0, skipped: true as const };
  }
  await recordUsage(client, {
    organizationId: input.organizationId,
    metric: input.metric,
    units: input.units,
    costMinor: settled.settledMinor,
  });
  return {
    chargedMinor: settled.settledMinor,
    releasedMinor: settled.releasedMinor,
    skipped: false as const,
  };
}

/** Exposed for the UI: what the customer would be charged before they press the button. */
export async function previewCost(client: SqlClient, organizationId: string, metric: string, units: number) {
  const estimate = estimateCostMinor(metric, units);
  const balance = await getBalanceMinor(client, organizationId);
  return {
    estimateMinor: estimate,
    estimateLabel: estimate === null ? "unpriced" : formatAed(estimate),
    balanceMinor: balance,
    balanceLabel: formatAed(balance),
    affordable: estimate !== null && (ALLOW_OVERDRAFT || estimate <= balance),
  };
}
