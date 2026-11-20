import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  PRODUCT_NAME,
  PRODUCT_NAME_AR,
  APP_STORE_NAME,
  SITE_URL,
  STORE_LISTING,
} from "../lib/brand";
const failures: string[] = [];
if (!COMPANY_LEGAL_NAME_AR?.trim())
  failures.push(
    "BLOCKER: exact Arabic legal name is missing; owner must copy it from the trade licence.",
  );
function walk(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  } catch {
    return [];
  }
}
const forbidden =
  /@gmail\.com|(?:[a-z0-9-]+\.)?vercel\.app|Sterilization|(?<!FZ-)\bLLC\b|zoka-ai\.com|SHURUO ALHAYAH|Al Narjis|النرجس|نرجس كلين/i;
const identifiers =
  /\bAE\d{2}[\s-]?(?:\d[\s-]?){19}\b|\b784[ -]?\d{4}[ -]?\d{7}[ -]?\d\b|(?:TRN|VAT|trade[ -]?licen[cs]e)\s*[:#]\s*[A-Z0-9-]{5,}/i;
const sourceFiles = ["app", "components", "lib", "public"]
  .flatMap(walk)
  .filter((p) => /\.(tsx?|jsx?|html|json|txt|webmanifest)$/.test(p));
for (const path of sourceFiles) {
  const source = readFileSync(path, "utf8");
  if (forbidden.test(source))
    failures.push(`Forbidden identity/contact literal in ${path}`);
  if (identifiers.test(source))
    failures.push(
      `Potential restricted identifier in ${path}; manual review required.`,
    );
  if (
    path !== "lib/brand.ts" &&
    path !== "lib/brand-identity.generated.ts" &&
    [
      COMPANY_LEGAL_NAME_EN,
      CONTACT_EMAIL,
      '"' + SITE_URL + '"',
      '"' + PRODUCT_NAME + '"',
      '"' + PRODUCT_NAME_AR + '"',
    ].some((v) => source.includes(v))
  )
    failures.push(
      `Duplicated canonical identity in ${path}; import lib/brand.ts instead.`,
    );
}
const phase = process.argv[2] ?? "source";
if (phase === "bundle") {
  for (const path of walk(".next").filter(
    (p) => /\.(?:js|html|json|rsc)$/.test(p) && !p.includes("cache/"),
  ))
    if (identifiers.test(readFileSync(path, "utf8")))
      failures.push(`Potential restricted identifier in built output: ${path}`);
}
if (
  STORE_LISTING.name !== APP_STORE_NAME ||
  STORE_LISTING.developer !== COMPANY_LEGAL_NAME_EN ||
  STORE_LISTING.supportEmail !== CONTACT_EMAIL ||
  STORE_LISTING.privacyPolicyUrl !== `${SITE_URL}/privacy`
)
  failures.push("Store listing mismatch.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Brand gate (${phase}) passed.`);
