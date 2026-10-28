import { type WorkspacePlan, workspacePlans } from "@/lib/saas/plans";

export const quotaFeatures = {
  chat_message: "monthlyMessages",
  agent_run: "monthlyAgentRuns",
  web_search: "monthlyWebSearches",
} as const;

export type QuotaFeature = keyof typeof quotaFeatures;

export function getQuotaStatus(
  plan: WorkspacePlan,
  feature: QuotaFeature,
  used: number
) {
  const limit = workspacePlans[plan][quotaFeatures[feature]];
  return {
    allowed: used < limit,
    feature,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}
