import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingEvent } from "@/components/billing-event";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n";
import { workspacePlans } from "@/lib/saas/plans";
import { displayWorkspaceName } from "@/lib/workspace-name";

import { ManageSubscriptionButton } from "./manage-subscription";

export default async function WorkspaceBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const billing = await getWorkspaceBilling(context.organizationId);
  const planKey = billing.subscription?.plan ?? "free";
  const plan = workspacePlans[planKey];
  const isPaid =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status) &&
    planKey !== "free";
  const canUpgrade = context.role === "owner" || context.role === "admin";
  const { success } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {displayWorkspaceName(context.workspace.name, lang)}
        </p>
        <h1 className="font-semibold text-2xl">Plan and usage</h1>
      </div>
      {success === "1" && (
        <>
          <BillingEvent event="checkout_success" />
          <p className="rounded-md border border-green-600 p-3 text-sm">
            Checkout completed. Your workspace plan will update as soon as
            Stripe confirms the subscription.
          </p>
        </>
      )}
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-medium text-lg">{plan.name} plan</h2>
        <p className="text-sm text-muted-foreground">
          {billing.subscription?.status ?? "active"}
          {billing.subscription?.periodEnd
            ? ` · Renews ${billing.subscription.periodEnd.toLocaleDateString()}`
            : ""}
        </p>
        <div className="text-sm">
          Chat messages this month: {billing.usage.messages.toLocaleString()} /{" "}
          {plan.monthlyMessages.toLocaleString()}
        </div>
        <div className="text-sm">
          Agent runs this month: {billing.usage.agentRuns.toLocaleString()} /{" "}
          {plan.monthlyAgentRuns.toLocaleString()}
        </div>
        {canUpgrade && !isPaid && (
          <Link
            className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            href="/pricing"
          >
            Upgrade
          </Link>
        )}
        {isPaid && <ManageSubscriptionButton />}
      </section>
    </main>
  );
}
