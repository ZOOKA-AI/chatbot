import { afterAll, describe, expect, it } from "vitest";

import { browserRuntime } from "@/lib/browser/runtime";

/**
 * The real browser, exercised for real.
 *
 * This runs only where a Chromium is actually installed: it launches one, navigates, reads, clicks,
 * scrolls and screenshots, and it checks that the URL policy refuses loopback before Chromium is
 * asked to open it. Where no browser is installed - CI without a download step, for example - the
 * suite skips instead of pretending to have verified anything.
 */
const hasChromium = await (async () => {
  // The module being importable says nothing about a browser being installed: pnpm installs the
  // playwright package everywhere, while the binary only exists after `playwright install`. CI
  // proved the difference - the suite ran against a missing executable and failed instead of
  // skipping, which is a false signal in both directions. The check is the executable itself.
  const { existsSync } = await import("node:fs");
  for (const candidate of ["playwright", "@playwright/test"]) {
    try {
      const loaded = (await import(/* @vite-ignore */ candidate)) as {
        chromium?: { executablePath?: () => string };
      };
      const binary = loaded.chromium?.executablePath?.();
      if (binary && existsSync(binary)) return true;
    } catch {
      // try the next candidate
    }
  }
  return false;
})();

const SESSION = "live-runtime-test";
const ORG = "live-runtime-org";

describe.skipIf(!hasChromium)("real browser runtime", () => {
  afterAll(async () => {
    await browserRuntime().close(SESSION);
  });

  it("opens a browser, navigates, reads, clicks, scrolls and stores a screenshot", async () => {
    const opened = await browserRuntime().open(SESSION, ORG);
    expect(opened).toMatchObject({ ok: true });

    const navigated = await browserRuntime().navigate(SESSION, ORG, "https://example.com");
    expect(navigated.ok).toBe(true);
    if (navigated.ok) {
      // example.com now answers with a localised notice, so the check is that a real title and a
      // real document came back rather than one exact English sentence.
      expect(navigated.title.length).toBeGreaterThan(0);
      expect(navigated.url).toContain("example.com");
    }

    // The page arrives on domcontentloaded, so text can be empty for a moment. Poll briefly, the way
    // a caller would, instead of asserting on the first frame.
    let read = await browserRuntime().read(SESSION, ORG, {});
    for (let attempt = 0; attempt < 5 && read.ok && read.text.length < 80; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      read = await browserRuntime().read(SESSION, ORG, {});
    }
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.text.length).toBeGreaterThan(80);
      expect(read.url).toContain("example.com");
    }

    const clicked = await browserRuntime().click(SESSION, ORG, "body");
    expect(clicked.ok).toBe(true);

    const scrolled = await browserRuntime().scroll(SESSION, ORG, 200);
    expect(scrolled.ok).toBe(true);

    const shot = await browserRuntime().screenshot(SESSION, ORG, "live-check");
    expect(shot.ok).toBe(true);
    if (shot.ok) expect(shot.bytes).toBeGreaterThan(1000);
  }, 180_000);

  it("refuses a loopback address before the browser opens it", async () => {
    await browserRuntime().open(SESSION, ORG);
    const refused = await browserRuntime().navigate(SESSION, ORG, "http://127.0.0.1:8080/admin");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code.startsWith("url_refused")).toBe(true);
  }, 120_000);

  it("keeps each workspace on its own browser", async () => {
    const a = "iso-workspace-a";
    const b = "iso-workspace-b";
    await browserRuntime().open(a, "org-a");
    await browserRuntime().open(b, "org-b");
    await browserRuntime().navigate(a, "org-a", "https://example.com");
    await browserRuntime().navigate(b, "org-b", "https://example.org");

    // A workspace cannot reach into another workspace's browser even with its session id.
    const crossed = await browserRuntime().navigate(a, "org-b", "https://example.net");
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.code).toBe("session_owned_by_another_workspace");

    // And the two pages are genuinely separate documents, not one shared tab.
    const pageA = await browserRuntime().read(a, "org-a", {});
    const pageB = await browserRuntime().read(b, "org-b", {});
    expect(pageA.ok && pageB.ok).toBe(true);
    if (pageA.ok && pageB.ok) {
      expect(pageA.url).toContain("example.com");
      expect(pageB.url).toContain("example.org");
    }
    await browserRuntime().close(a);
    await browserRuntime().close(b);
  }, 180_000);

  it("reports which engine is serving", () => {
    expect(["local_chromium", "browserless", "browserbase", "remote_cdp"]).toContain(
      browserRuntime().engine()
    );
  });
});
