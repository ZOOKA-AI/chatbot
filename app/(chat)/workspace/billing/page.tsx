import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { workspacePlans } from "@/lib/saas/plans";

export default async function WorkspaceBillingPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const billing = await getWorkspaceBilling(context.organizationId);
  const planKey = billing.subscription?.plan ?? "free";
  const plan = workspacePlans[planKey];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {context.workspace.name}
        </p>
        <h1 className="font-semibold text-2xl">Plan and usage</h1>
      </div>
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-medium text-lg">{plan.name} plan</h2>
        <p className="text-sm text-muted-foreground">
          {billing.subscription?.status ?? "active"} · Billing provider is not
          connected.
        </p>
        <div className="text-sm">
          Chat messages this month: {billing.usage.messages.toLocaleString()} /{" "}
          {plan.monthlyMessages?.toLocaleString() ?? "Unlimited"}
        </div>
        <p className="text-muted-foreground text-xs">
          Plan records and usage events are workspace-scoped. Payment-provider
          checkout and invoices are not enabled yet.
        </p>
      </section>
    </main>
  );
}
