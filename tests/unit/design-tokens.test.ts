import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

import { color, space, tokens } from "@/lib/design/tokens";

const CSS = readFileSync(join(process.cwd(), "styles/zooka-tokens.css"), "utf8");

test("the brand colours are exactly the approved identity", () => {
  assert.equal(color.brandBlue.toLowerCase(), "#2e86ab");
  assert.equal(color.brandPlum.toLowerCase(), "#a23b72");
  assert.equal(color.snow.toLowerCase(), "#f8f9fa");
});

test("every token in TypeScript exists as a CSS variable", () => {
  const missing: string[] = [];
  const expected = [
    ...Object.keys(color).map((key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)),
    "gradient-brand",
    "gradient-neural",
    ...Object.keys(space).map((key) => `space-${key}`),
  ];
  // Map camelCase token names to the kebab-case CSS suffixes used in the file.
  const alias: Record<string, string> = {
    "brand-blue": "brand-blue",
    "brand-plum": "brand-plum",
    snow: "snow",
    night: "night",
    "night-elevated": "night-elevated",
    ink: "ink",
    "ink-muted": "ink-muted",
    "on-brand": "on-brand",
    success: "success",
    warning: "warning",
    danger: "danger",
    border: "border",
    "border-on-dark": "border-on-dark",
    "glow-blue": "glow-blue",
    "glow-plum": "glow-plum",
  };
  for (const name of expected) {
    const suffix = alias[name] ?? name;
    const cssName = suffix.startsWith("gradient-")
      ? `--zk-${suffix}`
      : suffix.startsWith("space-")
        ? `--zk-${suffix}`
        : `--zk-color-${suffix}`;
    if (!CSS.includes(`${cssName}:`)) missing.push(cssName);
  }
  assert.deepEqual(missing, [], `CSS is missing: ${missing.join(", ")}`);
});

test("RTL and LTR are both served by the same sheet, with no physical left/right", () => {
  assert.match(CSS, /\[dir="rtl"\]/);
  assert.match(CSS, /\[dir="ltr"\]/);
  assert.ok(CSS.includes(":lang(ar)"), "Arabic type stack must be selected by lang");
  const physical = CSS.match(/(?<![a-z-])(margin-left|margin-right|padding-left|padding-right|left:|right:)/g);
  assert.equal(physical, null, `physical properties break RTL: ${physical?.join(", ")}`);
});

test("motion can be disabled and mobile spacing is tighter", () => {
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  assert.match(CSS, /max-width: 40rem/);
  assert.equal(tokens.layout.contentMax, "72rem");
});
