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
  for (const candidate of ["playwright", "@playwright/test"]) {
    try {
      const loaded = (await import(/* @vite-ignore */ candidate)) as {
        chromium?: { launch: unknown };
      };
      if (loaded.chromium) return true;
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

    const read = await browserRuntime().read(SESSION, ORG, {});
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

  it("reports which engine is serving", () => {
    expect(["local_chromium", "browserless", "browserbase", "remote_cdp"]).toContain(
      browserRuntime().engine()
    );
  });
});
