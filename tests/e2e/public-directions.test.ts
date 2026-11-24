import { expect, test } from "@playwright/test";

/**
 * The public surface in a real browser, asserting what is true today rather than
 * what the product intends to be true.
 *
 * Measured state, recorded deliberately: app/layout.tsx hardcodes dir="rtl" and
 * lang="ar" on <html> for every route, and /en answers 307 to /. There is
 * therefore no left-to-right surface to test. These tests pin that state so it
 * cannot drift silently in either direction: if English ships later the /en test
 * fails and forces a decision, and if the document direction changes the Arabic
 * tests fail.
 */

const ARABIC_PAGES = ["/", "/ar", "/login", "/pricing"];

for (const path of ARABIC_PAGES) {
  test(`${path} answers a visitor in Arabic, right to left`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBeLessThan(400);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", /^ar/);
    await expect(html).toHaveAttribute("dir", "rtl");
  });
}

test("the /en path redirects to the Arabic root instead of serving English", async ({ request }) => {
  const response = await request.get("/en", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/$/);
});

test("a mobile viewport does not overflow horizontally on the landing page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});
