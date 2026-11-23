import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "components/language-toggle.tsx"), "utf8");

describe("language switcher is crawlable", () => {
  it("renders an anchor, not a plain button", () => {
    expect(src).toContain("<Link");
    expect(src).not.toMatch(/<button/);
  });

  it("links the / and /ar pair with a real href", () => {
    expect(src).toContain('"/ar"');
    expect(src).toMatch(/href=\{href\}/);
  });

  it("does not call usePathname during render (static prerender safety)", () => {
    expect(src).not.toContain("usePathname");
    expect(src).toContain("useEffect");
  });

  it("keeps the visitor choice cookie and declares hrefLang", () => {
    expect(src).toContain("zooka_lang=");
    expect(src).toContain("hrefLang");
  });
});
