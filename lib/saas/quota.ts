import "server-only";

import { getWorkspaceBilling, getWorkspaceForUser, trackWorkspaceUsage } from "@/lib/db/queries";
import { getQuotaStatus, type QuotaFeature } from "@/lib/saas/quota-utils";

export async function checkQuota(
  userId: string,
  feature: QuotaFeature,
  organizationId: string,
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

  const billing = await getWorkspaceBilling(organizationId);
  const plan =
    billing.subscription &&
    ["active", "trialing"].includes(billing.subscription.status)
      ? billing.subscription.plan
      : "free";
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
  amount = 1,
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
