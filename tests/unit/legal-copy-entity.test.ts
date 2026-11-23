import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";
import { CONTACT_EMAIL, LEGAL_ADDRESS, LEGAL_ENTITY_NAME } from "@/lib/legal-entity";

/**
 * A public legal page that renders an unfilled [TOKEN], or omits the operating
 * entity, reads as an unfinished product to a visitor and to any crawler that
 * reads the repository. Both happened: /terms and /privacy used to be separate
 * hard-coded pages that never named the entity and published a personal Gmail
 * address, while the shared copy shipped raw [LEGAL_ENTITY_NAME] tokens.
 */

const PAGES: LegalPageId[] = ["about", "contact", "cookies", "privacy", "refund", "terms"];
const TOKEN = /\[[A-Z_]{4,}\]/;

for (const lang of ["ar", "en"] as const) {
  for (const page of PAGES) {
    test(`${lang}/${page} renders no raw token and names the operator`, () => {
      const copy = getLegalPageCopy(lang, page);
      const text = [copy.title, ...copy.sections.flatMap((s) => [s.title, s.body])].join("\n");

      assert.equal(TOKEN.test(text), false, `raw token in ${lang}/${page}: ${text.match(TOKEN)?.[0]}`);
      assert.ok(text.includes(LEGAL_ENTITY_NAME[lang]), `${lang}/${page} does not name the legal entity`);
      assert.ok(text.includes(CONTACT_EMAIL), `${lang}/${page} does not carry the monitored contact address`);
      assert.ok(copy.sections.length > 0);
    });
  }
}

test("address appears wherever the entity is introduced", () => {
  for (const lang of ["ar", "en"] as const) {
    for (const page of PAGES) {
      const text = getLegalPageCopy(lang, page).sections.map((s) => s.body).join(" ");
      if (text.includes(LEGAL_ENTITY_NAME[lang])) {
        assert.ok(
          text.includes(LEGAL_ADDRESS[lang]),
          `${lang}/${page} names the entity without the registered address`
        );
      }
    }
  }
});

test("no personal mailbox is published in the legal copy", () => {
  const source = readFileSync("lib/legal-copy.ts", "utf8");
  assert.equal(/zookaalmrzwq/.test(source), false);
  for (const lang of ["ar", "en"] as const) {
    for (const page of PAGES) {
      const text = getLegalPageCopy(lang, page).sections.map((s) => s.body).join(" ");
      assert.equal(/gmail\.com/.test(text), false, `${lang}/${page} leaks a personal Gmail address`);
    }
  }
});
