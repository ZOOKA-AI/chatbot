import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "vitest";

/**
 * A guard against the regression that mattered most here.
 *
 * The tenant layer existed and was tested, and no route used it: the Commander
 * ran on the shared connection while the policies protected nothing. This test
 * fails if a Commander route stops being wrapped, or if a new one is added
 * without the wrapper, which is the only way that hole cannot come back quietly.
 *
 * It reads the routes as text on purpose: the property being asserted is
 * structural (every handler goes through the wrapper), and a behavioural test
 * cannot see a route that was never written.
 */

const ROOT = "app/api/agents";
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("every Commander route runs inside the tenant scope", () => {
  const files = routeFiles(ROOT);

  test("there are routes to check", () => {
    assert.ok(files.length >= 12, `expected the Commander routes, found ${files.length}`);
  });

  for (const file of files) {
    test(file.replace("app/api/agents/", ""), () => {
      const source = readFileSync(file, "utf8");

      assert.match(
        source,
        /import \{ withCommanderTenant \} from "@\/lib\/agents\/commander-scope";/,
        "the route must import the tenant wrapper"
      );

      // Every HTTP method this file exports must go through the wrapper. The
      // original handler is renamed, so a handler that is exported directly
      // would bypass the scope silently.
      for (const method of METHODS) {
        const exportedDirectly = new RegExp(`export async function ${method}\\s*\\(`).test(source);
        assert.equal(
          exportedDirectly,
          false,
          `${method} must not be exported unwrapped: export it through withCommanderTenant`
        );

        const wrapped = new RegExp(`export const ${method} = withCommanderTenant\\(${method}Handler\\)`).test(source);
        const present = new RegExp(`async function ${method}Handler\\(`).test(source);
        if (present) {
          assert.equal(wrapped, true, `${method}Handler exists but is not exported through the wrapper`);
        }
      }
    });
  }
});
