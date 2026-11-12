/**
 * نموذج رسالة داخلي لدورة ReAct القديمة.
 * لا نستخدم أنواع AI SDK هنا عن قصد: هذا المسار تجريبي ومعزول عن مسار الشات.
 */
export type LegacyRole = "system" | "user" | "assistant" | "tool";

export type LegacyMessage = {
  role: LegacyRole;
  content: string;
};

export type LegacyToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type RunAgentResult = {
  content: string;
  toolsUsed: string[];
  model: string;
  stoppedByLimit: boolean;
};
