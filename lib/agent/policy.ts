import type { AgentPolicyRule, PolicyDecision, ToolKey } from "./types";
import { toolRequiresApproval } from "./registry";

export interface SpendSnapshot {
  spentTodayAed: number;
  spentMonthAed: number;
}

/**
 * قرار حتمي بالكامل (لا نموذج لغوي). الترتيب مقصود:
 * إيقاف عام ← سياسة معطّلة ← منع صريح ← سماح غير معلن ← سقف شهري ← سقف يومي ← موافقة.
 */
export function evaluateToolCall(input: {
  tool: ToolKey;
  policy: AgentPolicyRule;
  spend: SpendSnapshot;
  killSwitchOn: boolean;
}): PolicyDecision {
  const { tool, policy, spend, killSwitchOn } = input;

  if (killSwitchOn) return { allowed: false, reason: "kill_switch_on", needsApproval: false };
  if (!policy.enabled) return { allowed: false, reason: "policy_disabled", needsApproval: false };
  if (policy.denyTools.includes(tool)) return { allowed: false, reason: "tool_denied", needsApproval: false };
  if (!policy.allowTools.includes(tool)) return { allowed: false, reason: "tool_not_allowed", needsApproval: false };
  if (policy.maxMonthlySpendAed > 0 && spend.spentMonthAed >= policy.maxMonthlySpendAed)
    return { allowed: false, reason: "monthly_cap_reached", needsApproval: false };
  if (policy.maxDailySpendAed > 0 && spend.spentTodayAed >= policy.maxDailySpendAed)
    return { allowed: false, reason: "daily_cap_reached", needsApproval: false };

  const needsApproval = policy.requiresApproval.includes(tool) || toolRequiresApproval(tool);
  return { allowed: true, reason: "allowed", needsApproval };
}

/** إيقاف أمان تلقائي: يتطلب قرارًا بشريًا بعد التجاوز. */
export function shouldAutoShutdown(input: { consecutiveFailures: number; spentTodayAed: number; maxDailySpendAed: number }): boolean {
  if (input.consecutiveFailures >= 3) return true;
  if (input.maxDailySpendAed > 0 && input.spentTodayAed > input.maxDailySpendAed) return true;
  return false;
}
