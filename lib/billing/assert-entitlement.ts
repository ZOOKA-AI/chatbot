import { PLANS, type PlanKey } from "@/lib/billing/entitlements";

/**
 * Server-side guards. The UI already hides what a plan cannot use, but a free
 * workspace can still POST `agentMode: true` or hit a connect route directly,
 * so every privileged path asserts the contract before it runs.
 */
export class PlanRequiredError extends Error {
  constructor() {
    super("plan_required");
    this.name = "PlanRequired";
  }
}

export function assertCanConnect(plan: PlanKey, tool: "gmail" | "drive") {
  if (!PLANS[plan][tool]) {
    throw new PlanRequiredError();
  }
}

export function assertCanUseAgent(plan: PlanKey) {
  if (!PLANS[plan].agentMode) {
    throw new PlanRequiredError();
  }
}

export function canConnectAllTools(plan: PlanKey) {
  return PLANS[plan].gmail && PLANS[plan].drive;
}
