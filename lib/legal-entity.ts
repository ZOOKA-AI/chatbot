/**
 * Who is legally behind zooka-ai.com.
 *
 * These values are operational facts, not marketing: they must match the entity
 * Stripe pays out to and the address on the trade licence. Override through env
 * when the entity changes, so no legal page ever ships an unfilled token.
 */
export const LEGAL_ENTITY_NAME: Record<"ar" | "en", string> = {
  ar: "رويال هارون لخدمات التنظيف والتعقيم ش.ذ.م.م",
  en: "Royal Haroon Cleaning and Disinfection Services FZ-LLC",
};

export const LEGAL_ADDRESS: Record<"ar" | "en", string> = {
  ar: "مبنى كومباس، منطقة الحمراء الصناعية الحرة، رأس الخيمة، الإمارات العربية المتحدة",
  en: "Compass Building, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates",
};

/** Monitored inbox for legal and billing requests (env override allowed). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "helmyharoon8@gmail.com";

/** WhatsApp support line shown on /contact; calls are not answered. */
export const SUPPORT_PHONE = "+971566047579";

/** Governing law for the terms and refund policy. */
export const GOVERNING_LAW: Record<"ar" | "en", string> = {
  ar: "قوانين دولة الإمارات العربية المتحدة، وتختص محاكم إمارة رأس الخيمة بأي نزاع.",
  en: "The laws of the United Arab Emirates; the courts of Ras Al Khaimah have jurisdiction over any dispute.",
};

export function fillLegalTokens(text: string, lang: "ar" | "en"): string {
  return text
    .replaceAll("[LEGAL_ENTITY_NAME]", LEGAL_ENTITY_NAME[lang])
    .replaceAll("[LEGAL_ADDRESS]", LEGAL_ADDRESS[lang])
    .replaceAll("[CONTACT_EMAIL]", CONTACT_EMAIL);
}
