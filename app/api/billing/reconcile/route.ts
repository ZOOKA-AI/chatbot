import { captureException } from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { grantTokensForBillingPeriod } from "@/lib/db/token-wallets";
import { getPlanFromStripePriceId } from "@/lib/saas/plans";
import { getStripe, getStripeId } from "@/lib/saas/stripe";

/**
 * مصالحة الفواتير المدفوعة: تقرأ Stripe مباشرة وتمنح الأرصدة المستحقة.
 * آمنة للاستدعاء المتكرر: المنح مفتاحه الفاتورة، فلا يتكرر أبداً،
 * ولا تمنح إلا ما دفعته Stripe فعلاً. لا تعتمد على توقيع ويب هوك.
 */
async function run() {
  const stripe = getStripe();
  const invoices = await stripe.invoices.list({ limit: 25, status: "paid" });
  const results: Array<Record<string, unknown>> = [];

  for (const invoice of invoices.data) {
    if (!invoice.amount_paid || invoice.amount_paid <= 0) {
      continue;
    }
    const subscriptionId = getStripeId(
      invoice.parent?.subscription_details?.subscription ?? null
    );
    if (!subscriptionId) {
      continue;
    }
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const organizationId = subscription.metadata.organizationId;
      const configuredPlan = subscription.metadata.plan;
      const pricePlan = getPlanFromStripePriceId(
        subscription.items.data[0]?.price.id ?? ""
      );
      const plan =
        pricePlan ??
        (configuredPlan === "pro" ||
        configuredPlan === "business" ||
        configuredPlan === "starter"
          ? configuredPlan
          : null);
      if (!(organizationId && plan)) {
        results.push({
          invoice: invoice.id,
          skipped: "missing_metadata",
        });
        continue;
      }
      const item = subscription.items.data[0];
      const grant = await grantTokensForBillingPeriod({
        organizationId,
        plan,
        grantKey: `invoice:${invoice.id}`,
        periodStart: item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : null,
        periodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : null,
      });
      results.push({
        invoice: invoice.id,
        organizationId,
        plan,
        granted: grant.granted,
        skipped: grant.skipped,
      });
    } catch (error) {
      captureException(error, { tags: { area: "billing-reconcile" } });
      results.push({ invoice: invoice.id, error: "grant_failed" });
    }
  }

  return NextResponse.json({ checked: invoices.data.length, results });
}

export function GET() {
  return run();
}

export function POST() {
  return run();
}
