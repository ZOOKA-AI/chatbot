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
  const planKey =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status)
      ? billing.subscription.plan
      : "free";
  const plan = workspacePlans[planKey];
  const isPaid =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status) &&
    planKey !== "free";
  const hasBillingAccount =
    billing.subscription &&
    ["active", "trialing", "past_due"].includes(billing.subscription.status) &&
    !!billing.subscription.externalCustomerId;
  const canUpgrade = context.role === "owner" || context.role === "admin";
  const { success } = await searchParams;
  const isArabic = lang === "ar";
  const remainingMessages = Math.max(
    0,
    plan.monthlyMessages - billing.usage.messages
  );
  const remainingAgentRuns = Math.max(
    0,
    plan.monthlyAgentRuns - billing.usage.agentRuns
  );
  const remainingWebSearches = Math.max(
    0,
    plan.monthlyWebSearches - billing.usage.webSearches
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {displayWorkspaceName(context.workspace.name, lang)}
        </p>
        <h1 className="font-semibold text-2xl">
          {isArabic ? "الباقة والاستخدام" : "Plan and usage"}
        </h1>
      </div>
      {success === "1" && (
        <>
          <BillingEvent event="checkout_success" />
          <p className="rounded-md border border-green-600 p-3 text-sm">
            {isArabic
              ? "اكتملت عملية الدفع. ستتحدث باقة مساحة العمل بعد تأكيد Stripe للاشتراك."
              : "Checkout completed. Your workspace plan will update as soon as Stripe confirms the subscription."}
          </p>
        </>
      )}
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-medium text-lg">
          {isArabic
            ? planKey === "free"
              ? "الباقة المجانية"
              : planKey === "pro"
                ? "الباقة الاحترافية"
                : "باقة الأعمال"
            : `${plan.name} plan`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? billing.subscription?.status === "active"
              ? "نشطة"
              : billing.subscription?.status === "trialing"
                ? "تجريبية"
                : billing.subscription?.status === "past_due"
                  ? "متأخرة السداد"
                  : billing.subscription?.status === "canceled"
                    ? "ملغاة"
                    : "نشطة"
            : billing.subscription?.status ?? "active"}
          {billing.subscription?.periodEnd
            ? isArabic
              ? ` · تنتهي الفترة ${billing.subscription.periodEnd.toLocaleDateString("ar")}`
              : ` · Renews ${billing.subscription.periodEnd.toLocaleDateString()}`
            : ""}
        </p>
        <ul className="flex flex-col gap-3 text-sm" aria-label={isArabic ? "الاستخدام الشهري" : "Monthly usage"}>
          <li>
            {isArabic ? "الرسائل" : "Chat messages"}:{" "}
            {billing.usage.messages.toLocaleString(lang)} /{" "}
            {plan.monthlyMessages.toLocaleString(lang)}
            <span className="ms-2 text-muted-foreground">
              {isArabic
                ? `متبقي ${remainingMessages.toLocaleString(lang)}`
                : `${remainingMessages.toLocaleString(lang)} remaining`}
            </span>
          </li>
          <li>
            {isArabic ? "تشغيل الوكيل" : "Agent runs"}:{" "}
            {billing.usage.agentRuns.toLocaleString(lang)} /{" "}
            {plan.monthlyAgentRuns.toLocaleString(lang)}
            <span className="ms-2 text-muted-foreground">
              {isArabic
                ? `متبقي ${remainingAgentRuns.toLocaleString(lang)}`
                : `${remainingAgentRuns.toLocaleString(lang)} remaining`}
            </span>
          </li>
          <li>
            {isArabic ? "عمليات البحث" : "Web searches"}:{" "}
            {billing.usage.webSearches.toLocaleString(lang)} /{" "}
            {plan.monthlyWebSearches.toLocaleString(lang)}
            <span className="ms-2 text-muted-foreground">
              {isArabic
                ? `متبقي ${remainingWebSearches.toLocaleString(lang)}`
                : `${remainingWebSearches.toLocaleString(lang)} remaining`}
            </span>
          </li>
        </ul>
        {canUpgrade && !isPaid && !hasBillingAccount && (
          <Link
            className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            href="/pricing"
          >
            {isArabic ? "ترقية الباقة" : "Upgrade"}
          </Link>
        )}
        {canUpgrade && isPaid && planKey !== "business" && (
          <Link
            className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            href="/pricing"
          >
            {isArabic ? "استكشف الباقات الأعلى" : "Explore higher plans"}
          </Link>
        )}
        {canUpgrade && hasBillingAccount && <ManageSubscriptionButton />}
      </section>
    </main>
  );
}
