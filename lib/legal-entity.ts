/**
 * Who is legally behind zooka-ai.com.
 *
 * These values are operational facts, not marketing: they must match the entity
 * Stripe pays out to and the address on the trade licence. Override through env
 * when the entity changes, so no legal page ever ships an unfilled token.
 */
import {
  COMPANY_LEGAL_NAME_EN,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_PHONE_E164,
} from "./brand";
export const LEGAL_ENTITY_NAME: Record<"ar" | "en", string> = {
  // English fallback is explicit while the exact Arabic name is missing; release gate blocks publishing.
  ar: COMPANY_LEGAL_NAME_AR ?? COMPANY_LEGAL_NAME_EN,
  en: COMPANY_LEGAL_NAME_EN,
};
export const LEGAL_ADDRESS: Record<"ar" | "en", string> = {
  ar: COMPANY_ADDRESS,
  en: COMPANY_ADDRESS,
};
export { CONTACT_EMAIL };
export const SUPPORT_PHONE = CONTACT_PHONE_E164;

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
