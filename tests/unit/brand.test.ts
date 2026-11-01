import { describe, expect, it } from "vitest";
import {
  APP_STORE_NAME,
  BILLING_EMAIL,
  BRAND_PRICES,
  brandTitle,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  CONTACT_PHONE_E164,
  INVOICE_SELLER,
  PRODUCT_NAME,
  SITE_URL,
  STORE_LISTING,
  whatsappSignature,
} from "@/lib/brand";

describe("canonical brand", () => {
  it("uses the owner's spelling and entity", () => {
    expect(PRODUCT_NAME).toBe("Zooka AI");
    expect(SITE_URL).toBe("https://zooka-ai.com");
    expect(COMPANY_LEGAL_NAME_EN.endsWith("FZ-LLC")).toBe(true);
    expect(CONTACT_EMAIL).toBe("support@zooka-ai.com");
    expect(CONTACT_PHONE_E164).toBe("+971566047579");
  });
  it("keeps pricing and listing fields aligned", () => {
    expect(BRAND_PRICES).toEqual({ free: 0, pro: 19, business: 49 });
    expect(STORE_LISTING.name).toBe(APP_STORE_NAME);
    expect(STORE_LISTING.developer).toBe(COMPANY_LEGAL_NAME_EN);
    expect(STORE_LISTING.privacyPolicyUrl).toBe(`${SITE_URL}/privacy`);
    expect(INVOICE_SELLER).toContain(COMPANY_LEGAL_NAME_EN);
    expect(BILLING_EMAIL).toBe("billing@zooka-ai.com");
  });
  it("uses the licence-verified Arabic legal name", async () => {
    const { IDENTITY } = await import("@/lib/brand-identity.generated");
    expect(COMPANY_LEGAL_NAME_AR).toBe(IDENTITY.legalNameAr);
    expect(COMPANY_LEGAL_NAME_AR.startsWith("رويال هارون")).toBe(true);
    expect(COMPANY_LEGAL_NAME_AR).toContain("ش.م.ح");
    // The licence wording must survive: no "corrected" transliteration.
    expect(COMPANY_LEGAL_NAME_AR).not.toMatch(/إنفكشن|انفكشن/);
    expect(COMPANY_LEGAL_NAME_AR.length).toBeGreaterThan(40);
    expect(whatsappSignature()).toContain(COMPANY_LEGAL_NAME_AR);
  });
  it("deduplicates titles", () => {
    expect(brandTitle("Sign in | Zooka AI", "en")).toBe("Sign in | Zooka AI");
    expect(brandTitle("تسجيل الدخول", "ar")).toBe("تسجيل الدخول | زوكا AI");
  });
});
