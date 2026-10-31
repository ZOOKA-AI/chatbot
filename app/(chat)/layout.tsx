import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { BillingProvider } from "@/components/billing-provider";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n";
import { workspacePlans } from "@/lib/saas/plans";
import { displayWorkspaceName } from "@/lib/workspace-name";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
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
  const isAgentPlan =
    !!subscription &&
    subscription.plan !== "free" &&
    ["active", "trialing"].includes(subscription.status);
  const planKey = isAgentPlan && subscription ? subscription.plan : "free";
  const plan = workspacePlans[planKey];
  const agentRunsRemaining = Math.max(
    0,
    plan.monthlyAgentRuns - (billing?.usage.agentRuns ?? 0)
  );
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
        canUseAgentMode: isAgentPlan && agentRunsRemaining > 0,
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
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </BillingProvider>
  );
}
