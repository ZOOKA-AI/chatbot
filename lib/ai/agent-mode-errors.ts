import { ChatbotError, type ErrorCode } from "@/lib/errors";
import type { Lang } from "@/lib/i18n";

export type AgentModeError =
  | "paid_model_required"
  | "unsupported_model"
  | "plan_required"
  | "quota";

const errorCodes: Record<AgentModeError, ErrorCode> = {
  paid_model_required: "forbidden:chat",
  unsupported_model: "bad_request:api",
  plan_required: "forbidden:chat",
  quota: "rate_limit:chat",
};

const errorMessages: Record<Lang, Record<AgentModeError, string>> = {
  ar: {
    paid_model_required:
      "يتطلب هذا النموذج خطة Pro أو Business في مساحة العمل.",
    unsupported_model:
      "النموذج المحدد لا يدعم أدوات الوكيل. اختر نموذجاً يدعم استخدام الأدوات.",
    plan_required: "يتطلب وضع الوكيل خطة Pro أو Business في مساحة العمل.",
    quota: "وصلت مساحة العمل إلى حد تشغيلات الوكيل الشهري.",
  },
  en: {
    paid_model_required:
      "This model requires a Pro or Business workspace plan.",
    unsupported_model:
      "Agent mode is unavailable with this model. Choose a tool-capable model.",
    plan_required: "Agent mode requires a Pro or Business workspace plan.",
    quota: "This workspace has reached its monthly agent run limit.",
  },
};

export function agentModeErrorResponse(
  error: AgentModeError,
  lang: Lang = "en",
  modelId?: string
) {
  const cause =
    error === "unsupported_model" && modelId
      ? lang === "ar"
        ? `النموذج ${modelId} لا يدعم أدوات الوكيل. اختر نموذجاً يدعم استخدام الأدوات.`
        : `The ${modelId} model does not support Agent tools. Choose a tool-capable model.`
      : errorMessages[lang][error];

  return new ChatbotError(errorCodes[error], cause).toResponse();
}

export function localizeAgentModeErrorCause(cause: unknown, lang: Lang) {
  if (lang !== "ar" || typeof cause !== "string") {
    return cause;
  }

  const error = (Object.keys(errorMessages.en) as AgentModeError[]).find(
    (key) => errorMessages.en[key] === cause
  );
  if (error) {
    return errorMessages.ar[error];
  }

  const unsupportedModel =
    /^The (.+) model does not support Agent tools\. Choose a tool-capable model\.$/.exec(
      cause
    );
  return unsupportedModel
    ? `النموذج ${unsupportedModel[1]} لا يدعم أدوات الوكيل. اختر نموذجاً يدعم استخدام الأدوات.`
    : cause;
}
