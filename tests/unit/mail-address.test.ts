import { describe, expect, it } from "vitest";

import {
  MAIL_DOMAIN,
  checkAddress,
  checkLocalPart,
  fullAddress,
  isReserved,
  maskAddress,
  normalizeLocalPart,
  RESERVED_LOCAL_PARTS,
} from "@/lib/mail/address";

describe("mail address rules", () => {
  it("accepts a plain name and builds the address on our domain", () => {
    const result = checkLocalPart("helmy");
    expect(result).toEqual({ ok: true, localPart: "helmy", address: `helmy@${MAIL_DOMAIN}` });
  });

  it("normalises case and surrounding whitespace instead of rejecting it", () => {
    expect(normalizeLocalPart("  Helmy.Ali ")).toBe("helmy.ali");
    expect(checkLocalPart("  Helmy.Ali ").ok).toBe(true);
    expect(fullAddress("Helmy")).toBe(`helmy@${MAIL_DOMAIN}`);
  });

  it("rejects names that are too short or too long", () => {
    expect(checkLocalPart("ab")).toEqual({ ok: false, reason: "too_short" });
    expect(checkLocalPart("a".repeat(33))).toEqual({ ok: false, reason: "too_long" });
    expect(checkLocalPart("a".repeat(32)).ok).toBe(true);
  });

  it("rejects characters that carry a second meaning in mail systems", () => {
    for (const bad of ["he lmy", "hel+my", "hélmy", "helmy!", "hel/my", "hel@my"]) {
      expect(checkLocalPart(bad).ok).toBe(false);
    }
  });

  it("rejects separators at the edges and repeated separators", () => {
    expect(checkLocalPart(".helmy")).toEqual({ ok: false, reason: "leading_or_trailing_separator" });
    expect(checkLocalPart("helmy-")).toEqual({ ok: false, reason: "leading_or_trailing_separator" });
    expect(checkLocalPart("hel..my")).toEqual({ ok: false, reason: "repeated_separator" });
    expect(checkLocalPart("hel--my")).toEqual({ ok: false, reason: "repeated_separator" });
    expect(checkLocalPart("hel.my").ok).toBe(true);
    expect(checkLocalPart("hel_my").ok).toBe(true);
    expect(checkLocalPart("hel-my").ok).toBe(true);
  });

  it("keeps every authority-sounding name out of customers' hands", () => {
    for (const reserved of ["admin", "ADMIN", "support", "security", "billing", "postmaster", "noreply", "api"]) {
      expect(checkLocalPart(reserved)).toEqual({ ok: false, reason: "reserved" });
      expect(isReserved(reserved)).toBe(true);
    }
    expect(RESERVED_LOCAL_PARTS.size).toBeGreaterThan(100);
  });

  it("does not silently fold a confusable name into a reserved one", () => {
    // Cyrillic "а" in "аdmin": rejected as invalid characters, not mapped to "admin".
    const result = checkLocalPart("\u0430dmin");
    expect(result).toEqual({ ok: false, reason: "invalid_characters" });
  });

  it("refuses a full address on another domain", () => {
    expect(checkAddress(`helmy@${MAIL_DOMAIN}`).ok).toBe(true);
    expect(checkAddress("helmy@gmail.com")).toEqual({ ok: false, reason: "domain_not_allowed" });
  });

  it("masks an address for logs without losing its shape", () => {
    expect(maskAddress(`helmy@${MAIL_DOMAIN}`)).toBe(`h***@${MAIL_DOMAIN}`);
    expect(maskAddress("not-an-address")).toBe("***");
  });
});
