import Link from "next/link";
import { withTenantPage } from "@/lib/db/request-tenant";
import { redirect } from "next/navigation";
import { BillingEvent } from "@/components/billing-event";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { workspacePlans } from "@/lib/saas/plans";
import { displayWorkspaceName } from "@/lib/workspace-name";

import { ManageSubscriptionButton } from "./manage-subscription";

async function WorkspaceBillingPageImpl({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const [billing, entitlements] = await Promise.all([
    getWorkspaceBilling(context.organizationId),
    getWorkspaceEntitlements(context.organizationId),
  ]);
  const subscribedPlan =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status)
      ? billing.subscription.plan
      : "free";
  // Limits follow the same entitlement source as the API routes and the usage
  // page, so every screen shows one plan.
  const planKey = entitlements.plan;
  const plan = workspacePlans[planKey] ?? workspacePlans.free;
  const grantedByProgram =
    entitlements.grant === "owner_testing" ||
    entitlements.grant === "launch_program";
  const isPaid =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status) &&
    subscribedPlan !== "free";
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
            : (billing.subscription?.status ?? "active")}
          {billing.subscription?.periodEnd
            ? isArabic
              ? ` · تنتهي الفترة ${billing.subscription.periodEnd.toLocaleDateString("ar")}`
              : ` · Renews ${billing.subscription.periodEnd.toLocaleDateString()}`
            : ""}
        </p>
        {grantedByProgram ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            {isArabic
              ? `مفعّلة كباقة الأعمال عبر ${entitlements.grant === "owner_testing" ? "وصول المالك للاختبار" : "برنامج الإطلاق"}. اشتراكك المدفوع: ${subscribedPlan === "free" ? "لا يوجد" : workspacePlans[subscribedPlan]?.name ?? subscribedPlan}.`
              : `Business features are granted by ${entitlements.grant === "owner_testing" ? "owner testing access" : "the launch program"}. Paid subscription: ${subscribedPlan === "free" ? "none" : workspacePlans[subscribedPlan]?.name ?? subscribedPlan}.`}
          </p>
        ) : null}
        <ul
          aria-label={isArabic ? "الاستخدام الشهري" : "Monthly usage"}
          className="flex flex-col gap-3 text-sm"
        >
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
        {canUpgrade && isPaid && subscribedPlan !== "business" && (
          <Link
            className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            href="/pricing"
          >
            {isArabic ? "استكشف الباقات الأعلى" : "Explore higher plans"}
          </Link>
        )}
        {canUpgrade && hasBillingAccount && (
          <ManageSubscriptionButton lang={lang} />
        )}
      </section>
    </main>
  );
}

// Tenant-scoped render: data read during this page runs inside the caller's tenant.
export default withTenantPage(WorkspaceBillingPageImpl);
