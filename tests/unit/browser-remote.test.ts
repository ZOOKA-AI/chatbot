import { afterEach, describe, expect, it } from "vitest";

import { remoteConfigured, staticRemoteEndpoint } from "@/lib/browser/remote";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("remote browser endpoint", () => {
  it("prefers an explicit CDP endpoint", () => {
    process.env.BROWSER_CDP_URL = "wss://chrome.example/devtools/browser/abc";
    process.env.BROWSERLESS_TOKEN = "token-123";
    expect(staticRemoteEndpoint()).toMatchObject({ engine: "remote_cdp" });
  });

  it("builds the Browserless stealth endpoint with the region and captcha solving", () => {
    delete process.env.BROWSER_CDP_URL;
    process.env.BROWSERLESS_TOKEN = "token-123";
    process.env.BROWSERLESS_REGION = "production-lon";
    const endpoint = staticRemoteEndpoint();
    expect(endpoint?.engine).toBe("browserless");
    expect(endpoint?.url).toBe(
      "wss://production-lon.browserless.io/stealth?token=token-123&solveCaptchas=true"
    );
  });

  it("defaults the Browserless region", () => {
    delete process.env.BROWSER_CDP_URL;
    delete process.env.BROWSERLESS_REGION;
    process.env.BROWSERLESS_TOKEN = "token-123";
    expect(staticRemoteEndpoint()?.url).toContain("production-sfo.browserless.io");
  });

  it("reports nothing configured without any provider", () => {
    delete process.env.BROWSER_CDP_URL;
    delete process.env.BROWSERLESS_TOKEN;
    delete process.env.BROWSERBASE_API_KEY;
    expect(staticRemoteEndpoint()).toBeNull();
    expect(remoteConfigured()).toBe(false);
  });
});
