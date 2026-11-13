import { captureException } from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { grantPaidInvoiceTokens } from "@/lib/saas/invoice-tokens";
import { getStripe, getStripeId } from "@/lib/saas/stripe";

// Never mutate wallets through GET (including browser prefetches).
export function GET() {
  return NextResponse.json(
    { error: "Use authenticated POST" },
    {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  const context = await requireWorkspaceRole("admin");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace admin access required" },
      { status: 403 }
    );
  }
  // This endpoint is a browser-admin action, not an unauthenticated cron.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const billing = await getWorkspaceBilling(context.organizationId);
  const customer = billing.subscription?.externalCustomerId;
  if (!customer) {
    return NextResponse.json({ checked: 0, results: [] });
  }
  try {
    const stripe = getStripe();
    // Bounded, workspace-scoped reconciliation. Older history needs a separate review.
    const invoices = await stripe.invoices.list({
      limit: 100,
      status: "paid",
      customer,
    });
    const results: Array<{
      invoice: string;
      granted: number;
      skipped: string | null;
    }> = [];
    for (const invoice of invoices.data) {
      const subscriptionId = getStripeId(
        invoice.parent?.subscription_details?.subscription ?? null
      );
      if (!subscriptionId) {
        continue;
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata.organizationId !== context.organizationId) {
        continue;
      }
      const grant = await grantPaidInvoiceTokens(invoice, subscription);
      results.push({ invoice: invoice.id, ...grant });
    }
    return NextResponse.json(
      { checked: invoices.data.length, hasMore: invoices.has_more, results },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch {
    captureException(new Error("Workspace billing reconciliation failed"), {
      tags: { area: "billing-reconcile" },
    });
    return NextResponse.json(
      { error: "Reconciliation failed; safe to retry" },
      { status: 500 }
    );
  }
}
