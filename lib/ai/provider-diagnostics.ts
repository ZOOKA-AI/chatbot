import type { Lang } from "@/lib/i18n";

type ProviderEnvironment = {
  aiGatewayApiKey?: string;
  geminiApiKey?: string;
  vercel?: string;
  isTest?: boolean;
};

export function getMissingModelProviderMessage(
  lang: Lang,
  environment: ProviderEnvironment
) {
  if (
    environment.isTest ||
    environment.aiGatewayApiKey?.trim() ||
    environment.geminiApiKey?.trim() ||
    environment.vercel === "1"
  ) {
    return null;
  }

  return lang === "ar"
    ? "خدمة النماذج غير مهيأة. أضف AI_GATEWAY_API_KEY خارج Vercel، أو انشر عبر Vercel AI Gateway، أو أضف GEMINI_API_KEY."
    : "The model service is not configured. Set AI_GATEWAY_API_KEY outside Vercel, deploy with Vercel AI Gateway, or set GEMINI_API_KEY.";
}

function getStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  const status = "status" in error ? error.status : undefined;
  return typeof statusCode === "number"
    ? statusCode
    : typeof status === "number"
      ? status
      : undefined;
}

export function describeModelProviderFailure(error: unknown, lang: Lang) {
  const statusCode = getStatusCode(error);
  const name =
    error && typeof error === "object" && "name" in error
      ? error.name
      : undefined;

  if (statusCode === 401 || statusCode === 403) {
    return lang === "ar"
      ? "رفض مزود الذكاء الاصطناعي الوصول. تحقق من مفتاح AI Gateway وصلاحية النموذج."
      : "The AI provider denied access. Check the AI Gateway key and model access.";
  }
  if (statusCode === 402) {
    return lang === "ar"
      ? "رصيد أو فوترة AI Gateway غير كافٍ. تحقق من إعدادات الفوترة في Vercel."
      : "AI Gateway billing or credits are unavailable. Check Vercel billing settings.";
  }
  if (statusCode === 404) {
    return lang === "ar"
      ? "النموذج المحدد غير متاح لدى المزود. تحقق من معرّف النموذج وإمكانية الوصول إليه."
      : "The selected model is unavailable from the provider. Check its model ID and access.";
  }
  if (statusCode === 429) {
    return lang === "ar"
      ? "تجاوزت طلبات مزود الذكاء الاصطناعي الحد المسموح. انتظر قليلاً ثم أعد المحاولة."
      : "The AI provider rate limit was reached. Wait briefly, then try again.";
  }
  if (name === "AbortError" || name === "TimeoutError") {
    return lang === "ar"
      ? "انتهت مهلة استجابة النموذج. أعد المحاولة أو اختر نموذجاً أسرع."
      : "The model request timed out. Retry or choose a faster model.";
  }
  return lang === "ar"
    ? "تعذر إكمال طلب النموذج. تحقق من إعداد AI Gateway وصحة النموذج، ثم راجع سجلات الخادم."
    : "The model request failed. Check AI Gateway configuration and model availability, then review server logs.";
}

export function logModelProviderFailure(
  error: unknown,
  modelId: string,
  area: "guest-chat" | "chat"
) {
  const name =
    error && typeof error === "object" && "name" in error
      ? error.name
      : undefined;
  console.error("AI model request failed", {
    area,
    modelId,
    errorName: typeof name === "string" ? name : "unknown",
    statusCode: getStatusCode(error),
  });
}
