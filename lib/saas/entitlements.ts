import { getWorkspaceBilling, getWorkspaceOwnerEmail } from "@/lib/db/queries";
import {
  hasUnlimitedTestingAccess,
  isUnlimitedTestingEnabled,
} from "@/lib/billing/testing-access";
import { type WorkspacePlan, workspacePlans } from "@/lib/saas/plans";

/**
 * Statuses that still grant paid entitlements. `past_due` is deliberately
 * excluded: paid features stop while a payment is outstanding, and resume as
 * soon as Stripe reports the subscription active again.
 */
const ENTITLED_STATUSES = ["active", "trialing"] as const;

export type WorkspaceEntitlements = {
  plan: WorkspacePlan;
  isPaid: boolean;
  canConnectIntegrations: boolean;
  canUseAgentMode: boolean;
  agentRunsRemaining: number;
  messagesLimit: number;
  /** Owner testing access: features unlocked, customer-facing cap waived, usage still metered. */
  unlimitedTesting: boolean;
};

const freeEntitlements: WorkspaceEntitlements = {
  plan: "free",
  isPaid: false,
  canConnectIntegrations: false,
  canUseAgentMode: false,
  agentRunsRemaining: 0,
  messagesLimit: workspacePlans.free.monthlyMessages,
  unlimitedTesting: false,
};

/**
 * Single source of truth for what a workspace may do. Both the UI and the API
 * routes read this, so a plan change in Stripe takes effect everywhere at once
 * without duplicating billing rules in each screen.
 */
export async function getWorkspaceEntitlements(
  organizationId: string | null | undefined
): Promise<WorkspaceEntitlements> {
  if (!organizationId) {
    return freeEntitlements;
  }

  // Owner testing access: only consulted when the deployment switch is on, so
  // normal requests pay nothing for this feature. The Subscription row is never
  // read for the decision and never modified.
  if (isUnlimitedTestingEnabled()) {
    const ownerEmail = await getWorkspaceOwnerEmail(organizationId).catch(() => null);
    if (hasUnlimitedTestingAccess(ownerEmail)) {
      const testingPlan = workspacePlans.business;
      const testingBilling = await getWorkspaceBilling(organizationId);
      return {
        plan: "business",
        isPaid: true,
        canConnectIntegrations: true,
        canUseAgentMode: true,
        agentRunsRemaining: Math.max(
          0,
          testingPlan.monthlyAgentRuns - (testingBilling?.usage.agentRuns ?? 0)
        ),
        messagesLimit: testingPlan.monthlyMessages,
        unlimitedTesting: true,
      };
    }
  }

  const billing = await getWorkspaceBilling(organizationId);
  const subscription = billing?.subscription;
  const isPaid =
    !!subscription &&
    subscription.plan !== "free" &&
    (ENTITLED_STATUSES as readonly string[]).includes(subscription.status);

  if (!isPaid || !subscription) {
    return freeEntitlements;
  }

  const plan = workspacePlans[subscription.plan as WorkspacePlan] ?? workspacePlans.free;
  const agentRunsRemaining = Math.max(
    0,
    plan.monthlyAgentRuns - (billing?.usage.agentRuns ?? 0)
  );

  return {
    plan: subscription.plan as WorkspacePlan,
    isPaid: true,
    canConnectIntegrations: true,
    canUseAgentMode: agentRunsRemaining > 0,
    agentRunsRemaining,
    messagesLimit: plan.monthlyMessages,
    unlimitedTesting: false,
  };
}
