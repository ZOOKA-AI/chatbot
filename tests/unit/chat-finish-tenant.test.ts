import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The finish callback of /api/chat runs after the response has started streaming.
 *
 * At that point the request's own tenant transaction has committed and its
 * organisation setting is gone, so a write issued there is filtered out by row
 * level security: the chat lookup comes back empty and the assistant message is
 * never stored, while the reply itself already reached the browser.
 *
 * The callback must therefore open its own tenant transaction for the workspace
 * resolved at the top of the handler.
 */
const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");

describe("chat finish callback", () => {
  it("opens a tenant transaction instead of reusing the request handle", () => {
    const finish = source.slice(source.indexOf("onFinish:"));
    expect(finish).toContain("runInTenantTransaction(");
    expect(finish).toContain("workspaceContext.organizationId");
  });

  it("does not bind the callback to a transaction that has already committed", () => {
    expect(source).not.toContain("runWithCommanderDb(requestTenantDb");
  });
});
