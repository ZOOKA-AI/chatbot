/**
 * Canonical owner-supplied identity.
 *
 * The legal name, address, phone and mailboxes are NOT in this repository: they
 * are sealed with AES-256-GCM in lib/brand-sealed.json and unsealed at build
 * time (see next.config.ts). Nothing here falls back to a plaintext default, so
 * a missing BRAND_SEAL_KEY fails the build instead of publishing a guess.
 */
import { IDENTITY } from "./brand-identity.generated";

export const PRODUCT_NAME = "Zooka AI" as const;
export const PRODUCT_NAME_AR = "زوكا AI" as const;
export const APP_STORE_NAME = "ZOOKA AI" as const;
export const SITE_URL = "https://zooka-ai.com" as const;
export const TAGLINE_AR =
  "مساعد أعمال ذكي يرد على عملائك، يحجز لهم، ويدير فواتيرك" as const;
export const TAGLINE_EN =
  "The AI operations assistant for small service businesses" as const;
export const COMPANY_LEGAL_NAME_EN = IDENTITY.legalNameEn;
/**
 * Exact Arabic legal name, copied character for character from the RAKEZ
 * Services Licence (licensee + operating name line). It is a transliteration of
 * the English name, so never translate it and never "correct" its spelling.
 */
export const COMPANY_LEGAL_NAME_AR = IDENTITY.legalNameAr;
export const COMPANY_ADDRESS = IDENTITY.address;
export const COMPANY_COUNTRY = IDENTITY.country;
export const CONTACT_EMAIL = IDENTITY.contactEmail;
export const PRIVACY_EMAIL = IDENTITY.privacyEmail;
export const BILLING_EMAIL = IDENTITY.billingEmail;
export {
  MASKED_PHONE_LABEL as CONTACT_PHONE_DISPLAY,
  WHATSAPP_PHONE_E164 as CONTACT_PHONE_E164,
} from "./brand-display";

export const COPYRIGHT =
  `© 2026 ${COMPANY_LEGAL_NAME_EN}. All rights reserved.` as const;
export const INVOICE_SELLER =
  `${APP_STORE_NAME} (${COMPANY_LEGAL_NAME_EN})` as const;
export const EMAIL_FROM = `${PRODUCT_NAME} <${CONTACT_EMAIL}>` as const;
export const PRICE_LABELS = {
  free: "Free $0",
  pro: "Pro $19",
  business: "Business $49",
  enterprise: "Enterprise on request",
} as const;
export const BRAND_PRICES = { free: 0, pro: 19, business: 49 } as const;
/** Connection handlers implemented in this repository; not evidence of account connectivity. */
export const CONNECTABLE_PROVIDER_IDS = [
  "gmail",
  "google_drive",
  "github",
  "vercel",
  "n8n",
] as const;
export const CONNECTABLE_INTEGRATION_COUNT = CONNECTABLE_PROVIDER_IDS.length;
export const STORE_LISTING = {
  name: APP_STORE_NAME,
  developer: COMPANY_LEGAL_NAME_EN,
  supportEmail: CONTACT_EMAIL,
  privacyPolicyUrl: `${SITE_URL}/privacy`,
  website: SITE_URL,
} as const;
export function brandTitle(page: string, lang: "ar" | "en") {
  const product = lang === "ar" ? PRODUCT_NAME_AR : PRODUCT_NAME;
  const clean = page
    .replaceAll(PRODUCT_NAME, "")
    .replaceAll(PRODUCT_NAME_AR, "")
    .replaceAll(APP_STORE_NAME, "")
    .replace(/[|—]/g, " ")
    .trim();
  return clean ? `${clean} | ${product}` : product;
}
export function whatsappSignature() {
  if (!COMPANY_LEGAL_NAME_AR)
    throw new Error(
      "Exact Arabic legal name must be supplied by the owner before publishing.",
    );
  return `${PRODUCT_NAME_AR} — خدمة مقدَّمة من ${COMPANY_LEGAL_NAME_AR}`;
}
