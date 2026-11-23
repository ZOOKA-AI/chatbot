export const MAX_CHAT_TEXT_LENGTH = 2_000;
export const CHAT_TEXT_TOO_LONG = "chat_text_too_long";

export function chatTextLimitMessage(lang: "ar" | "en") {
  return lang === "ar"
    ? `الرسالة أطول من الحد المسموح (${MAX_CHAT_TEXT_LENGTH} حرف). قسّمها إلى رسائل أقصر.`
    : `This message exceeds the ${MAX_CHAT_TEXT_LENGTH}-character limit. Split it into shorter messages.`;
}
