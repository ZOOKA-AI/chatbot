const callbackMessages = {
  ar: {
    connected: "تم ربط Google Drive بمساحة العمل.",
    error: "تعذّر ربط Google Drive. تحقّق من إعدادات OAuth وحاول مرة أخرى.",
    cancelled: "أُلغيت عملية ربط Google Drive؛ لم يتغير الاتصال الحالي.",
    unavailable:
      "ربط Google Drive غير متاح حاليًا. تحقّق من إعداد الخادم أو تواصل مع مسؤول مساحة العمل.",
  },
  en: {
    connected: "Google Drive is connected to this workspace.",
    error:
      "Google Drive could not be connected. Check the OAuth setup and try again.",
    cancelled:
      "Google Drive setup was cancelled; the existing connection was not changed.",
    unavailable:
      "Google Drive setup is currently unavailable. Check the server configuration or contact a workspace admin.",
  },
} as const;

export function getGoogleDriveCallbackFeedback(
  result: string | undefined,
  lang: "ar" | "en"
) {
  if (!result || !Object.hasOwn(callbackMessages.en, result)) {
    return null;
  }
  return callbackMessages[lang][result as keyof typeof callbackMessages.en];
}
