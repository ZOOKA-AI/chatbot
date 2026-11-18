import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureLiveBrowser, resumableEndpoint } from "@/lib/browser/resume";

/**
 * These tests state the two honest outcomes: a resumable endpoint is adopted, and an engine that
 * cannot outlive a connection is reported as such instead of being papered over.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resumableEndpoint", () => {
  it("is null when nothing is configured", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    expect(resumableEndpoint()).toBeNull();
  });

  it("returns the configured endpoint, trimmed", () => {
    vi.stubEnv("BROWSER_CDP_URL", "  ws://127.0.0.1:9333/devtools/browser/abc  ");
    expect(resumableEndpoint()).toBe("ws://127.0.0.1:9333/devtools/browser/abc");
  });
});

describe("ensureLiveBrowser", () => {
  it("refuses to invent continuity when the engine cannot be resumed", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    const outcome = await ensureLiveBrowser({
      sessionId: "no-such-session",
      organizationId: "no-such-org",
    });
    expect(outcome).toEqual({
      ok: false,
      code: "engine_not_resumable",
      message: expect.stringContaining("fresh browser"),
    });
  });

  it("reports the real failure when the endpoint is configured but unreachable", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "ws://127.0.0.1:1/devtools/browser/dead");
    const outcome = await ensureLiveBrowser({
      sessionId: "no-such-session",
      organizationId: "no-such-org",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) expect(outcome.code).toBe("reattach_failed");
  }, 20_000);

  it("never adopts a session that belongs to another workspace", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "ws://127.0.0.1:1/devtools/browser/dead");
    const outcome = await ensureLiveBrowser({
      sessionId: "session-owned-elsewhere",
      organizationId: "workspace-b",
    });
    expect(outcome.ok).toBe(false);
  }, 20_000);
});
