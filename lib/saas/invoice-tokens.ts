import type Stripe from "stripe";
import { grantTokensForBillingPeriod } from "@/lib/db/token-wallets";
import { getPlanFromStripePriceId } from "@/lib/saas/plans";
import { getStripeId } from "@/lib/saas/stripe";

/** Use the paid invoice's period and price, never today's subscription period. */
export async function grantPaidInvoiceTokens(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription
) {
  if (invoice.status !== "paid" || invoice.amount_paid <= 0) {
    return { granted: 0, skipped: "not_paid" };
  }
  const subscriptionId = getStripeId(
    invoice.parent?.subscription_details?.subscription ?? null
  );
  const organizationId = subscription.metadata.organizationId;
  if (
    !organizationId ||
    subscriptionId !== subscription.id ||
    getStripeId(invoice.customer) !== getStripeId(subscription.customer)
  ) {
    throw new Error("Invoice subscription ownership mismatch");
  }
  // Incomplete line lists must be retried rather than silently acknowledging them.
  if (invoice.lines.has_more) {
    throw new Error("Invoice lines require review before granting credits");
  }
  const lines = invoice.lines.data.filter(
    (line) =>
      line.parent?.subscription_item_details?.subscription ===
        subscription.id &&
      !line.parent.subscription_item_details.proration &&
      line.amount > 0
  );
  if (lines.length === 0) {
    return { granted: 0, skipped: "no_recurring_line" };
  }
  if (lines.length !== 1) {
    throw new Error("Ambiguous invoice token allowance");
  }
  const line = lines[0];
  const price = line.pricing?.price_details?.price;
  const plan = getPlanFromStripePriceId(
    price ? (getStripeId(price) ?? "") : ""
  );
  if (!plan) {
    throw new Error("Invoice price has no configured token allowance");
  }
  return grantTokensForBillingPeriod({
    organizationId,
    plan,
    grantKey: `invoice:${invoice.id}`,
    periodStart: new Date(line.period.start * 1000),
    periodEnd: new Date(line.period.end * 1000),
  });
}
