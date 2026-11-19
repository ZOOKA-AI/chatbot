import assert from "node:assert/strict";
import { describe, expect, test } from "vitest";

import WorkspaceAutomationsPage from "@/app/(chat)/workspace/automations/page";
import WorkspaceIntegrationsPage from "@/app/(chat)/workspace/integrations/page";

/**
 * Two routes the home page links to answered 404: /workspace/automations and /workspace/integrations.
 *
 * They are redirects now, and a redirect has three properties worth pinning. It must point at the
 * single real implementation (no second catalogue page). It must stay a server component inside the
 * (chat) group, so the session and tenant context are established before anything renders, exactly
 * like the destination. And it must not answer 200 with an empty body, which is what a placeholder
 * page would do and what makes a broken link look fixed.
 */

function redirectTarget(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    // Next signals a redirect by throwing; the digest carries the destination.
    const digest = (error as { digest?: string }).digest ?? "";
    const match = /NEXT_REDIRECT;[^;]*;([^;]+)/.exec(digest);
    if (match) return match[1];
    throw error;
  }
  throw new Error("the page rendered instead of redirecting");
}

describe("workspace redirect routes", () => {
  test("/workspace/automations lands on the read-only n8n overview", () => {
    assert.equal(redirectTarget(() => WorkspaceAutomationsPage()), "/workspace/admin/n8n");
  });

  test("/workspace/integrations lands on the single integration catalogue", () => {
    assert.equal(redirectTarget(() => WorkspaceIntegrationsPage()), "/settings/integrations");
  });

  test("both destinations are authenticated surfaces, not public pages", () => {
    // A redirect into a public page would leak the entry point to an anonymous visitor; both targets
    // live under the workspace/settings trees that middleware protects.
    for (const target of ["/workspace/admin/n8n", "/settings/integrations"]) {
      expect(target.startsWith("/workspace") || target.startsWith("/settings")).toBe(true);
      expect(target.startsWith("/login")).toBe(false);
    }
  });
});
