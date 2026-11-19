#!/usr/bin/env node
/**
 * Fails the build if a legal/marketing placeholder leaks into rendered copy.
 *
 * The legal pages fill [LEGAL_ENTITY_NAME], [LEGAL_ADDRESS] and [CONTACT_EMAIL]
 * at request time, so a visitor should never see an uppercase bracket token.
 * This guard scans the page and copy sources for any remaining [SOMETHING_LIKE_THIS].
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = [".tsx", ".ts", ".mdx"];
const TOKEN = /\[[A-Z][A-Z0-9_]{3,}\]/g;
const ALLOWED = new Set([
  "[LEGAL_ENTITY_NAME]",
  "[LEGAL_ADDRESS]",
  "[CONTACT_EMAIL]",
]);

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, files);
    } else if (EXTENSIONS.some((extension) => full.endsWith(extension))) {
      files.push(full);
    }
  }
  return files;
}

const problems = [];

for (const file of ROOTS.flatMap((root) => walk(root))) {
  // The two legal modules are where raw tokens are defined and filled.
  if (file.endsWith(join("lib", "legal-copy.ts")) || file.endsWith(join("lib", "legal-entity.ts"))) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  for (const match of text.match(TOKEN) ?? []) {
    if (ALLOWED.has(match)) {
      problems.push(`${file}: ${match} must be filled at render time, not hardcoded`);
    } else {
      problems.push(`${file}: unresolved placeholder ${match}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Placeholder check failed:\n" + problems.map((line) => `  ${line}`).join("\n"));
  process.exit(1);
}

console.log("Placeholder check passed.");
