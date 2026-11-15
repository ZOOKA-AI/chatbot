/** أنواع نواة الوكيل — ZOOKA-AI P1 (غير منشورة على الإنتاج) */
export type AgentKey = "master" | "research" | "writing" | "design" | "analysis" | "automation" | "marketing";

export type ToolKey =
  | "web.search"
  | "web.fetch"
  | "media.generate_image"
  | "media.render_video"
  | "storage.upload"
  | "db.query_readonly"
  | "integration.read"
  | "integration.write"
  | "ads.read"
  | "ads.propose_change"
  | "ads.execute_change"
  | "comms.email_send"
  | "publish.social";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";
export type StepStatus = "ok" | "error" | "skipped" | "blocked";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "expired";

export interface ToolSpec {
  key: ToolKey;
  description: string;
  requiresApproval: boolean;
  maxCostUsdPerCall: number;
  scopes: string[];
}

export interface AgentPolicyRule {
  organizationId: string;
  agentKey: AgentKey;
  allowTools: ToolKey[];
  denyTools: ToolKey[];
  maxDailySpendAed: number;
  maxMonthlySpendAed: number;
  requiresApproval: ToolKey[];
  enabled: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "tool_denied"
    | "tool_not_allowed"
    | "approval_required"
    | "daily_cap_reached"
    | "monthly_cap_reached"
    | "kill_switch_on"
    | "policy_disabled";
  needsApproval: boolean;
}
