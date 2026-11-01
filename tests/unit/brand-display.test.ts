import { describe, expect, it } from "vitest";
import {
  MASKED_COMPANY_FIELD,
  MASKED_PHONE_LABEL,
  maskLegalText,
  WHATSAPP_SUPPORT_URL,
} from "@/lib/brand-display";

describe("owner-requested visual masking", () => {
  it("redacts overlapping identity fields while leaving emails", () => {
    expect(
      maskLegalText("Example Company, Example address, support@example.com", [
        "Example Company",
        "Example",
        "Example address",
      ]),
    ).toBe(
      `${MASKED_COMPANY_FIELD}, ${MASKED_COMPANY_FIELD}, support@example.com`,
    );
  });
  it("ignores empty fields and masks repeated values", () => {
    expect(maskLegalText("Name / Name", ["", "Name", "Name"])).toBe(
      `${MASKED_COMPANY_FIELD} / ${MASKED_COMPANY_FIELD}`,
    );
    expect(maskLegalText("support@example.com", [])).toBe(
      "support@example.com",
    );
  });
  it("uses the corrected WhatsApp destination without displaying digits", () => {
    expect(WHATSAPP_SUPPORT_URL).toBe("https://wa.me/971566047579");
    expect(MASKED_PHONE_LABEL).not.toMatch(/\d/);
  });
});
