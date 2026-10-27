import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { syncWorkspaceSubscription } from "@/lib/db/queries";
import { getPlanFromStripePriceId, type WorkspacePlan } from "@/lib/saas/plans";
import { getStripe, getStripeId, mapStripeStatus } from "@/lib/saas/stripe";

function isPaidPlan(plan: WorkspacePlan): plan is "pro" | "business" {
  return plan === "pro" || plan === "business";
}

async function syncFromCheckout(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  const plan = session.metadata?.plan;
  const externalSubscriptionId = getStripeId(session.subscription);

  if (
    session.mode !== "subscription" ||
    !organizationId ||
    (plan !== "pro" && plan !== "business") ||
    !externalSubscriptionId
  ) {
    throw new Error("Checkout session is missing subscription metadata");
  }

  const subscription = await getStripe().subscriptions.retrieve(
    externalSubscriptionId
  );
  if (
    subscription.metadata.organizationId !== organizationId ||
    subscription.metadata.plan !== plan
  ) {
    throw new Error("Stripe subscription metadata does not match Checkout");
  }
  await syncFromSubscription(subscription);
}

async function syncFromSubscription(
  subscription: Stripe.Subscription,
  statusOverride?: "past_due"
) {
  const organizationId = subscription.metadata.organizationId;
  if (!organizationId) {
    throw new Error("Stripe subscription is missing organization metadata");
  }

  const configuredPlan = subscription.metadata.plan;
  const pricePlan = getPlanFromStripePriceId(
    subscription.items.data[0]?.price.id ?? ""
  );
  const plan =
    pricePlan ??
    (configuredPlan === "pro" || configuredPlan === "business"
      ? configuredPlan
      : null);
  if (!plan || !isPaidPlan(plan)) {
    throw new Error("Stripe subscription uses an unconfigured price");
  }

  const status = statusOverride ?? mapStripeStatus(subscription.status);
  await syncWorkspaceSubscription({
    organizationId,
    plan: status === "canceled" ? "free" : plan,
    status,
    externalCustomerId: getStripeId(subscription.customer),
    externalSubscriptionId: subscription.id,
    periodEnd: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000)
      : null,
  });
}

async function syncFromFailedInvoice(invoice: Stripe.Invoice) {
  const subscriptionId = getStripeId(
    invoice.parent?.subscription_details?.subscription ?? null
  );
  if (!subscriptionId) {
    return;
  }
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await syncFromSubscription(subscription, "past_due");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      {
        status: 503,
      }
    );
  }
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      {
        status: 400,
      }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      {
        status: 400,
      }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      await syncFromCheckout(event.data.object);
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncFromSubscription(event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      await syncFromFailedInvoice(event.data.object);
    }
  } catch (error) {
    console.error("Failed to synchronize Stripe subscription", error);
    return NextResponse.json(
      { error: "Subscription synchronization failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
