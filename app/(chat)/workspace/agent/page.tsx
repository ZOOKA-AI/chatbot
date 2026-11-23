import { redirect } from "next/navigation";
import { withTenantPage } from "@/lib/db/request-tenant";
import { AgentConsole } from "@/components/agent-console";
import { AgentBrowserDock } from "@/components/agent-browser-dock";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { workspacePlans } from "@/lib/saas/plans";

async function WorkspaceAgentPageImpl() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const [{ usage }, entitlements] = await Promise.all([
    getWorkspaceBilling(context.organizationId),
    getWorkspaceEntitlements(context.organizationId),
  ]);
  const plan = entitlements.plan;
  const limit = (workspacePlans[plan] ?? workspacePlans.free).monthlyAgentRuns;

  return (
    <main className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-3xl flex-col gap-4 p-4">
      <AgentConsole
        limit={limit}
        plan={(workspacePlans[plan] ?? workspacePlans.free).name}
        used={usage.agentRuns}
      />
      {/* المتصفح على بعد نقرة من المحادثة: زر يظهر ويختفي بدل صفحة منفصلة */}
      <AgentBrowserDock />
    </main>
  );
}

// Tenant-scoped render: data read during this page runs inside the caller's tenant.
export default withTenantPage(WorkspaceAgentPageImpl);
