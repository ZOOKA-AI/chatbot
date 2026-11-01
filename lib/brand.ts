/** Canonical owner-supplied identity. Do not override legal/support fields via public env. */
export const PRODUCT_NAME = "Zooka AI" as const;
export const PRODUCT_NAME_AR = "زوكا AI" as const;
export const APP_STORE_NAME = "ZOOKA AI" as const;
export const SITE_URL = "https://zooka-ai.com" as const;
export const TAGLINE_AR =
  "مساعد أعمال ذكي يرد على عملائك، يحجز لهم، ويدير فواتيرك" as const;
export const TAGLINE_EN =
  "The AI operations assistant for small service businesses" as const;
export const COMPANY_LEGAL_NAME_EN =
  "Royal Haroon Cleaning and Disinfection Services FZ-LLC" as const;
/** BLOCKER: owner must copy the exact Arabic legal name from the licence. Never translate. */
export const COMPANY_LEGAL_NAME_AR: string | null = null;
export const COMPANY_ADDRESS =
  "Compass Building, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates" as const;
export const COMPANY_COUNTRY = "United Arab Emirates" as const;
export const CONTACT_EMAIL = "support@zooka-ai.com" as const;
export const PRIVACY_EMAIL = "privacy@zooka-ai.com" as const;
export const BILLING_EMAIL = "billing@zooka-ai.com" as const;
export const CONTACT_PHONE_E164 = "+971563177803" as const;
export const CONTACT_PHONE_DISPLAY = "0563177803" as const;
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
