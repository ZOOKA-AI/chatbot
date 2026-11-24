import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

// A regression test with a specific history. The browser runtime once imported
// playwright-core statically, which was correct for the bundler and fatal for the
// product: the deployed package was missing browsers.json, so every route that
// merely imported this file failed at module load. /api/chat answered 500 with an
// empty body for every user while the browser was never called. The import is now
// lazy and its specifier is still a literal, so the bundler can trace it and an
// unrelated route cannot be taken down by it.
const source = readFileSync(join(process.cwd(), "lib/browser/runtime.ts"), "utf8");

describe("the browser driver is loaded on demand", () => {
  test("no static import of playwright-core", () => {
    expect(source).not.toMatch(/^\s*import\s+\{[^}]*\}\s+from\s+["']playwright-core["']/m);
  });

  test("the dynamic specifier is a literal so the bundler can still trace it", () => {
    expect(source).toMatch(/import\(\s*["']playwright-core["']\s*\)/);
    // A specifier held in a variable is the failure mode that made the module
    // resolve to nothing inside the deployed function.
    expect(source).not.toMatch(/import\(\s*[A-Za-z_$][\w$]*\s*\)/);
  });

  test("the module can be imported without playwright present", async () => {
    const mod = await import("@/lib/browser/runtime");
    expect(typeof mod).toBe("object");
  });

  test("a broken install is a recorded refusal with a stable code", async () => {
    const mod = await import("@/lib/browser/runtime");
    const error = new mod.BrowserUnavailableError("browsers.json missing");
    expect(error.code).toBe("browser_runtime_unavailable");
    expect(error.message).toContain("browsers.json missing");
  });
});
