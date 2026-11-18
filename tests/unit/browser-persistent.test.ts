import { describe, expect, it } from "vitest";

import {
  authorizesHandle,
  handleKeySource,
  mintHandle,
  verifyHandle,
} from "@/lib/browser/persistent";

/**
 * The capability rules for a browser-side session.
 *
 * A browser context id is enough to read a customer's cookies, so the handle carries an HMAC over
 * its ids and the workspace that owns it. These tests lock the parts that must not drift: a handle
 * only validates for the workspace it was minted for, and any edit to the ids breaks it.
 *
 * The browser behaviour itself (does the tab survive the worker?) cannot be unit tested: it needs a
 * real engine and two OS processes, and it is proven by scripts/browser/continuity-gate.ts.
 */
describe("persistent browser handles", () => {
  const base = {
    endpoint: "http://127.0.0.1:19222",
    browserContextId: "ctx-1",
    targetId: "tab-1",
  };

  it("validates for the workspace it was minted for", () => {
    const handle = mintHandle({ ...base, organizationId: "org-A" });
    expect(verifyHandle(handle, "org-A")).toBe(true);
  });

  it("does not validate for another workspace", () => {
    const handle = mintHandle({ ...base, organizationId: "org-A" });
    expect(verifyHandle(handle, "org-B")).toBe(false);
  });

  it("breaks when the target or context is swapped", () => {
    const handle = mintHandle({ ...base, organizationId: "org-A" });
    expect(verifyHandle({ ...handle, targetId: "tab-2" }, "org-A")).toBe(false);
    expect(verifyHandle({ ...handle, browserContextId: "ctx-2" }, "org-A")).toBe(false);
  });

  it("refuses an unsigned or truncated signature", () => {
    const handle = mintHandle({ ...base, organizationId: "org-A" });
    expect(verifyHandle({ ...handle, signature: "" }, "org-A")).toBe(false);
    expect(verifyHandle({ ...handle, signature: handle.signature.slice(0, 16) }, "org-A")).toBe(
      false,
    );
  });

  it("authorizes only matching workspaces with a valid handle", () => {
    const handle = mintHandle({ ...base, organizationId: "org-A" });
    expect(
      authorizesHandle(handle, { organizationId: "org-A" }, { organizationId: "org-A" }),
    ).toBe(true);
    expect(
      authorizesHandle(handle, { organizationId: "org-A" }, { organizationId: "org-B" }),
    ).toBe(false);
    expect(
      authorizesHandle(handle, { organizationId: "org-B" }, { organizationId: "org-B" }),
    ).toBe(false);
  });

  it("reports whether the signing key is a real secret", () => {
    // Never assert the value, only that a missing secret is visible rather than silent.
    expect(["env", "dev_fallback"]).toContain(handleKeySource());
  });
});
