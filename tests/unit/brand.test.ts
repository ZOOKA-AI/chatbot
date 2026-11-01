import { describe, expect, it } from "vitest";
import {
  APP_STORE_NAME,
  BILLING_EMAIL,
  BRAND_PRICES,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  CONTACT_PHONE_E164,
  INVOICE_SELLER,
  PRODUCT_NAME,
  SITE_URL,
  STORE_LISTING,
  brandTitle,
  whatsappSignature,
} from "@/lib/brand";
describe("canonical brand", () => {
  it("uses the owner's spelling and entity", () => {
    expect(PRODUCT_NAME).toBe("Zooka AI");
    expect(SITE_URL).toBe("https://zooka-ai.com");
    expect(COMPANY_LEGAL_NAME_EN.endsWith("FZ-LLC")).toBe(true);
    expect(CONTACT_EMAIL).toBe("support@zooka-ai.com");
    expect(CONTACT_PHONE_E164).toBe("+971563177803");
  });
  it("keeps pricing and listing fields aligned", () => {
    expect(BRAND_PRICES).toEqual({ free: 0, pro: 19, business: 49 });
    expect(STORE_LISTING.name).toBe(APP_STORE_NAME);
    expect(STORE_LISTING.developer).toBe(COMPANY_LEGAL_NAME_EN);
    expect(STORE_LISTING.privacyPolicyUrl).toBe(`${SITE_URL}/privacy`);
    expect(INVOICE_SELLER).toContain(COMPANY_LEGAL_NAME_EN);
    expect(BILLING_EMAIL).toBe("billing@zooka-ai.com");
  });
  it("uses the exact Arabic legal name from the trade licence", () => {
    expect(COMPANY_LEGAL_NAME_AR).toBe(
      "رويال هارون كليننيغ اند دس انفكشين سيرفسز ش.م.ح - ذ.م.م",
    );
    expect(COMPANY_LEGAL_NAME_AR).toContain("كليننيغ");
    expect(COMPANY_LEGAL_NAME_AR).toContain("انفكشين");
    expect(whatsappSignature()).toContain(COMPANY_LEGAL_NAME_AR);
  });
  it("deduplicates titles", () => {
    expect(brandTitle("Sign in | Zooka AI", "en")).toBe("Sign in | Zooka AI");
    expect(brandTitle("تسجيل الدخول", "ar")).toBe("تسجيل الدخول | زوكا AI");
  });
});
