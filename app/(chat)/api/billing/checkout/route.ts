import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getStripePriceId, paidWorkspacePlans } from "@/lib/saas/plans";
import { getStripe } from "@/lib/saas/stripe";

const checkoutSchema = z.object({
  plan: z.enum(paidWorkspacePlans),
});

export async function POST(request: Request) {
  const context = await requireWorkspaceRole("admin");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace admin access required" },
      {
        status: 403,
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = getStripePriceId(parsed.data.plan);
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing setup required: configure STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }
  if (!priceId) {
    return NextResponse.json(
      {
        error: `Billing setup required: configure STRIPE_PRICE_${parsed.data.plan.toUpperCase()} with its Stripe Price ID.`,
      },
      { status: 503 }
    );
  }

  const billing = await getWorkspaceBilling(context.organizationId);

  try {
    const stripe = getStripe();

    // Guard against stale subscription records left by earlier test-mode runs:
    // only block checkout when the subscription really exists in the live account.
    const storedSubId = billing.subscription?.externalSubscriptionId;
    if (
      storedSubId &&
      ["active", "trialing", "past_due"].includes(billing.subscription?.status ?? "")
    ) {
      let liveSubActive = false;
      try {
        const sub = await stripe.subscriptions.retrieve(storedSubId);
        liveSubActive = ["active", "trialing", "past_due"].includes(sub.status);
      } catch {
        liveSubActive = false;
      }
      if (liveSubActive) {
        return NextResponse.json(
          { error: "This workspace already has a paid subscription" },
          { status: 409 }
        );
      }
    }

    let reusableCustomerId: string | undefined;
    if (billing.subscription?.externalCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(
          billing.subscription.externalCustomerId
        );
        if (!(customer as { deleted?: boolean }).deleted) {
          reusableCustomerId = billing.subscription.externalCustomerId;
        }
      } catch {
        reusableCustomerId = undefined;
      }
    }
    const configuredOrigin =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.AUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const appOrigin =
      configuredOrigin ??
      (process.env.NODE_ENV === "production"
        ? null
        : new URL(request.url).origin);
    if (!appOrigin) {
      return NextResponse.json(
        { error: "Application URL is not configured" },
        { status: 503 }
      );
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: context.organizationId,
      ...(reusableCustomerId
        ? { customer: reusableCustomerId }
        : { customer_email: context.user.email ?? undefined }),
      metadata: {
        organizationId: context.organizationId,
        plan: parsed.data.plan,
      },
      subscription_data: {
        metadata: {
          organizationId: context.organizationId,
          plan: parsed.data.plan,
        },
      },
      success_url: new URL(
        "/workspace/billing?success=1",
        appOrigin
      ).toString(),
      cancel_url: new URL("/pricing?canceled=1", appOrigin).toString(),
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("Failed to create Stripe Checkout session", error);
    return NextResponse.json(
      { error: "Unable to start checkout" },
      { status: 502 }
    );
  }
}
