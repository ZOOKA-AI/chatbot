import "server-only";

import {
  getWorkspaceBilling,
  getWorkspaceForUser,
  trackWorkspaceUsage,
} from "@/lib/db/queries";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { getQuotaStatus, type QuotaFeature } from "@/lib/saas/quota-utils";

export async function checkQuota(
  userId: string,
  feature: QuotaFeature,
  organizationId: string
) {
  const workspace = await getWorkspaceForUser(userId, organizationId);
  if (!workspace) {
    return {
      allowed: false,
      feature,
      limit: 0,
      used: 0,
      remaining: 0,
      organizationId,
    };
  }

  // Plan comes from the shared entitlement source so owner testing and the
  // launch program grant the same limits here as on every screen.
  const [billing, entitlements] = await Promise.all([
    getWorkspaceBilling(organizationId),
    getWorkspaceEntitlements(organizationId),
  ]);
  const plan = entitlements.plan;
  const used =
    feature === "chat_message"
      ? billing.usage.messages
      : feature === "agent_run"
        ? billing.usage.agentRuns
        : billing.usage.webSearches;

  return {
    ...getQuotaStatus(plan, feature, used),
    organizationId,
    plan,
  };
}

export async function recordUsage(
  userId: string,
  feature: QuotaFeature,
  organizationId: string,
  amount = 1
) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Usage amount must be a positive integer");
  }

  const workspace = await getWorkspaceForUser(userId, organizationId);
  if (!workspace) {
    throw new Error("Workspace access is required to record usage");
  }

  return trackWorkspaceUsage({
    organizationId,
    userId,
    event: feature,
    quantity: amount,
  });
}
