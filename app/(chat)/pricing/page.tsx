import Link from "next/link";
import { PricingCheckoutButton } from "@/components/pricing-checkout-button";
import { getStripePriceId, workspacePlans } from "@/lib/saas/plans";

const pricingPlanKeys = ["free", "pro", "business"] as const;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { canceled } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-10 p-6 py-16">
      <header className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-sm">
          Simple, transparent plans
        </p>
        <h1 className="font-semibold text-4xl">
          Choose the right workspace plan
        </h1>
        <p className="text-muted-foreground">
          Start for free and upgrade whenever your team needs more.
        </p>
      </header>

      {canceled && (
        <p className="text-center text-sm text-muted-foreground">
          Checkout was canceled. No changes were made.
        </p>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        {pricingPlanKeys.map((planKey) => {
          const plan = workspacePlans[planKey];
          const isPaid = planKey !== "free";
          const setupMessage =
            planKey === "free"
              ? undefined
              : process.env.STRIPE_SECRET_KEY
                ? getStripePriceId(planKey)
                  ? undefined
                  : `Billing setup required: configure STRIPE_PRICE_${planKey.toUpperCase()} with its Stripe Price ID.`
                : "Billing setup required: configure STRIPE_SECRET_KEY.";
          return (
            <article
              className="flex flex-col gap-6 rounded-xl border p-6"
              key={planKey}
            >
              <div className="flex flex-col gap-2">
                <h2 className="font-semibold text-xl">{plan.name}</h2>
                <p className="text-3xl font-semibold">
                  ${plan.price}
                  <span className="font-normal text-base text-muted-foreground">
                    {plan.price ? " / month" : ""}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {plan.monthlyMessages.toLocaleString()} messages per month
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              {isPaid ? (
                <PricingCheckoutButton
                  label={`Upgrade to ${plan.name}`}
                  plan={planKey}
                  setupMessage={setupMessage}
                />
              ) : (
                <Link
                  className="w-full rounded-md border px-4 py-2 text-center font-medium"
                  href="/"
                >
                  Start for free
                </Link>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
