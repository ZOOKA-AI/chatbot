import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { workspacePlans } from "@/lib/saas/plans";

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const billing = await getWorkspaceBilling(context.organizationId);
  const subscription = billing.subscription;
  const hasAgentPlan =
    context.user.type === "regular" &&
    !!subscription &&
    subscription.plan !== "free" &&
    ["active", "trialing"].includes(subscription.status);
  const plan =
    hasAgentPlan && subscription
      ? workspacePlans[subscription.plan]
      : workspacePlans.free;
  const agentRunsRemaining = Math.max(
    0,
    plan.monthlyAgentRuns - billing.usage.agentRuns
  );

  return NextResponse.json(
    {
      canUseAgentMode: hasAgentPlan && agentRunsRemaining > 0,
      hasAgentPlan,
      agentRunsRemaining,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
