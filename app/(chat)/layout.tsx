import { cookies } from "next/headers";
import { withTenantPage } from "@/lib/db/request-tenant";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { BillingProvider } from "@/components/billing-provider";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { getLang } from "@/lib/i18n";
import { workspacePlans } from "@/lib/saas/plans";
import { displayWorkspaceName } from "@/lib/workspace-name";

async function LayoutImpl({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DataStreamProvider>
        <Suspense fallback={<div className="flex h-dvh" />}>
          <SidebarWrapper>{children}</SidebarWrapper>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [context, cookieStore, lang] = await Promise.all([
    getWorkspaceContext(),
    cookies(),
    getLang(),
  ]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  const isGuest = !context || context.user.type === "guest";
  const billing = context
    ? await getWorkspaceBilling(context.organizationId)
    : null;
  const subscription = billing?.subscription;
  const hasPaidPlan =
    !!subscription &&
    subscription.plan !== "free" &&
    ["active", "trialing", "past_due"].includes(subscription.status);
  // One source of truth for agent access, shared with the API routes: a paid
  // subscription, or a live launch-testing claim, which is what makes the
  // toggle available to the first registered testers without any charge.
  const entitlements = context
    ? await getWorkspaceEntitlements(context.organizationId)
    : null;
  const isAgentPlan = entitlements?.isPaid ?? false;
  const agentRunsRemaining = entitlements?.agentRunsRemaining ?? 0;
  const canManageBilling =
    hasPaidPlan &&
    !!subscription?.externalCustomerId &&
    (context?.role === "owner" || context?.role === "admin");

  // Anonymous visitors get the public marketing page with no app chrome.
  if (!context) {
    return <>{children}</>;
  }

  return (
    <BillingProvider
      value={{
        lang,
        isGuest,
        organizationId: context?.organizationId ?? null,
        isSubscribed: hasPaidPlan,
        canUseAgentMode: entitlements?.canUseAgentMode ?? false,
        hasAgentPlan: isAgentPlan,
        agentRunsRemaining,
        canManageBilling,
      }}
    >
      <SidebarProvider defaultOpen={!isCollapsed}>
        <AppSidebar
          isGuest={isGuest}
          role={context?.role}
          user={context?.user}
          workspaceName={
            context
              ? displayWorkspaceName(context.workspace.name, lang)
              : undefined
          }
        />
        <SidebarInset>
          {children}
          <MobileBottomNav />
        </SidebarInset>
      </SidebarProvider>
    </BillingProvider>
  );
}

// Tenant-scoped render: data read during this page runs inside the caller's tenant.
export default withTenantPage(LayoutImpl);
