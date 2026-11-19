import { NextResponse } from "next/server";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

async function GETImpl() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  // Same decision the chat route and the sidebar read: paid plan OR a live
  // launch-testing claim. Usage stays metered, nothing is deducted.
  const entitlements = await getWorkspaceEntitlements(context.organizationId);

  return NextResponse.json(
    {
      canUseAgentMode:
        context.user.type === "regular" && entitlements.canUseAgentMode,
      hasAgentPlan: context.user.type === "regular" && entitlements.isPaid,
      agentRunsRemaining: entitlements.agentRunsRemaining,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

// Tenant-scoped wrappers: query work runs inside the caller's tenant transaction.
export const GET = withRequestTenantHandler(GETImpl);
