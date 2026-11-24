import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, LEGAL_ADDRESS, LEGAL_ENTITY_NAME, fillLegalTokens } from "@/lib/legal-entity";

const root = process.cwd();

describe("legal pages name the operator", () => {
  for (const page of ["app/terms/page.tsx", "app/privacy/page.tsx"]) {
    it(page + " renders the legal entity, address and contact", () => {
      const src = readFileSync(join(root, page), "utf8");
      expect(src).toContain("@/lib/legal-entity");
      expect(src).toContain("LEGAL_ENTITY_NAME");
      expect(src).toContain("LEGAL_ADDRESS");
      expect(src).toContain("CONTACT_EMAIL");
      expect(src).not.toMatch(/\[[A-Z_]{3,}\]/);
    });
  }

  it("the entity is the trading company, not a placeholder", () => {
    expect(LEGAL_ENTITY_NAME.en).toMatch(/Royal Haroon/i);
    expect(LEGAL_ADDRESS.en).toMatch(/Ras Al Khaimah/i);
    expect(CONTACT_EMAIL).toMatch(/@zooka-ai\.com$/);
  });

  it("fillLegalTokens leaves no raw token behind", () => {
    const out = fillLegalTokens("[LEGAL_ENTITY_NAME] — [LEGAL_ADDRESS] — [CONTACT_EMAIL]", "ar");
    expect(out).not.toContain("[LEGAL_");
    expect(out).toContain(LEGAL_ENTITY_NAME.ar);
  });
});
