import {
  getUserEmailById,
  getWorkspaceBilling,
  getWorkspaceOwnerId,
} from "@/lib/db/queries";
import { isOwnerTestingEmail, ownerTestingEmails } from "@/lib/billing/owner-testing";
import { hasLaunchSlot, isLaunchProgramOpen } from "@/lib/billing/launch-program";
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
};

const freeEntitlements: WorkspaceEntitlements = {
  plan: "free",
  isPaid: false,
  canConnectIntegrations: false,
  canUseAgentMode: false,
  agentRunsRemaining: 0,
  messagesLimit: workspacePlans.free.monthlyMessages,
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

  // Launch testing program (first twenty accounts) and owner testing access
  // (addresses in OWNER_TESTING_EMAILS) keep full features without a
  // subscription. Checked before billing so a missing Subscription row cannot
  // block them.
  const launchOpen = isLaunchProgramOpen();
  const ownerTestingOn = ownerTestingEmails().size > 0;
  if (launchOpen || ownerTestingOn) {
    const ownerId = await getWorkspaceOwnerId(organizationId).catch(() => null);
    const ownerEmail =
      ownerTestingOn && ownerId
        ? await getUserEmailById(ownerId).catch(() => null)
        : null;
    if (
      isOwnerTestingEmail(ownerEmail) ||
      (launchOpen && (await hasLaunchSlot(ownerId)))
    ) {
      const launchPlan = workspacePlans.business;
      return {
        plan: "business",
        isPaid: true,
        canConnectIntegrations: true,
        canUseAgentMode: true,
        agentRunsRemaining: launchPlan.monthlyAgentRuns,
        messagesLimit: launchPlan.monthlyMessages,
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
  };
}
