import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function getStripeId(
  resource: string | { id: string } | null
): string | null {
  if (!resource) {
    return null;
  }
  return typeof resource === "string" ? resource : resource.id;
}

export function mapStripeStatus(
  status: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "canceled" {
  if (status === "trialing") {
    return "trialing";
  }
  if (status === "active") {
    return "active";
  }
  if (status === "canceled") {
    return "canceled";
  }
  return "past_due";
}
