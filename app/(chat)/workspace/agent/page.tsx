import { redirect } from "next/navigation";
import { withTenantPage } from "@/lib/db/request-tenant";
import { AgentConsole } from "@/components/agent-console";
import { AgentBrowserDock } from "@/components/agent-browser-dock";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";

const PLAN_LIMITS: Record<string, number> = {
  free: 30,
  starter: 100,
  pro: 500,
  business: 2000,
};

async function WorkspaceAgentPageImpl() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const { subscription, usage } = await getWorkspaceBilling(context.organizationId);
  const plan = (subscription?.plan ?? "free").toLowerCase();
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return (
    <main className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-3xl flex-col gap-4 p-4">
      <AgentConsole limit={limit} plan={plan} used={usage.agentRuns} />
      {/* المتصفح على بعد نقرة من المحادثة: زر يظهر ويختفي بدل صفحة منفصلة */}
      <AgentBrowserDock />
    </main>
  );
}

// Tenant-scoped render: data read during this page runs inside the caller's tenant.
export default withTenantPage(WorkspaceAgentPageImpl);
