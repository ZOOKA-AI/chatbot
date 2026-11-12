import { redirect } from "next/navigation";
import { AgentConsole } from "@/components/agent-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";

const PLAN_LIMITS: Record<string, number> = {
  free: 30,
  starter: 100,
  pro: 500,
  business: 2000,
};

export default async function WorkspaceAgentPage() {
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
    </main>
  );
}
