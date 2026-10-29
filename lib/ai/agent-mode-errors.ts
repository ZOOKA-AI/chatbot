import { ChatbotError } from "@/lib/errors";
import type { Lang } from "@/lib/i18n";

export type AgentModeError = "unsupported_model" | "plan_required" | "quota";

const agentModeErrors = {
  unsupported_model: {
    code: "bad_request:api",
    cause:
      "Agent mode is unavailable with this model. Choose a tool-capable model.",
    arabicCause:
      "وضع الوكيل غير متاح مع هذا النموذج. اختر نموذجاً يدعم الأدوات.",
  },
  plan_required: {
    code: "forbidden:chat",
    cause: "Agent mode requires a Pro or Business workspace plan.",
    arabicCause: "يتطلب وضع الوكيل خطة Pro أو Business لمساحة العمل.",
  },
  quota: {
    code: "rate_limit:chat",
    cause: "This workspace has reached its monthly agent run limit.",
    arabicCause: "وصلت مساحة العمل إلى الحد الشهري لتشغيلات الوكيل.",
  },
} as const;

export function agentModeErrorResponse(error: AgentModeError) {
  const { code, cause } = agentModeErrors[error];
  return new ChatbotError(code, cause).toResponse();
}

export function localizeAgentModeErrorCause(cause: unknown, lang: Lang) {
  const error = Object.values(agentModeErrors).find(
    (agentModeError) => agentModeError.cause === cause
  );
  return error && lang === "ar" ? error.arabicCause : cause;
}
