import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getStripe } from "@/lib/saas/stripe";

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

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing setup required: configure STRIPE_SECRET_KEY." },
      {
        status: 503,
      }
    );
  }

  const billing = await getWorkspaceBilling(context.organizationId);
  const customerId = billing.subscription?.externalCustomerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No subscription found for this workspace" },
      {
        status: 400,
      }
    );
  }

  try {
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
        {
          status: 503,
        }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: new URL("/workspace/billing", appOrigin).toString(),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create Stripe billing portal session", error);
    return NextResponse.json(
      { error: "Unable to open subscription management" },
      {
        status: 502,
      }
    );
  }
}
