import { afterEach, describe, expect, it, vi } from "vitest";

import { remoteConfigured, staticRemoteEndpoint } from "@/lib/browser/remote";

// vi.stubEnv keeps the rest of the environment intact. Replacing process.env wholesale broke the
// other suites in the same run, which is exactly the kind of cross-test damage to avoid.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("remote browser endpoint", () => {
  it("prefers an explicit CDP endpoint", () => {
    vi.stubEnv("BROWSER_CDP_URL", "wss://chrome.example/devtools/browser/abc");
    vi.stubEnv("BROWSERLESS_TOKEN", "token-123");
    expect(staticRemoteEndpoint()).toMatchObject({ engine: "remote_cdp" });
  });

  it("builds the Browserless stealth endpoint with the region and captcha solving", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    vi.stubEnv("BROWSERLESS_TOKEN", "token-123");
    vi.stubEnv("BROWSERLESS_REGION", "production-lon");
    const endpoint = staticRemoteEndpoint();
    expect(endpoint?.engine).toBe("browserless");
    expect(endpoint?.url).toBe(
      "wss://production-lon.browserless.io/stealth?token=token-123&solveCaptchas=true"
    );
  });

  it("defaults the Browserless region", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    vi.stubEnv("BROWSERLESS_REGION", "");
    vi.stubEnv("BROWSERLESS_TOKEN", "token-123");
    expect(staticRemoteEndpoint()?.url).toContain("production-sfo.browserless.io");
  });

  it("reports nothing configured without any provider", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    vi.stubEnv("BROWSERLESS_TOKEN", "");
    vi.stubEnv("BROWSERBASE_API_KEY", "");
    expect(staticRemoteEndpoint()).toBeNull();
    expect(remoteConfigured()).toBe(false);
  });
});
