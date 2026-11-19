import { expect, test } from "@playwright/test";

// Local-only fixture assembled by scripts/test-composer.mjs; never shipped.
test.skip(
  process.env.COMPOSER_LAYOUT_TEST !== "1",
  "Run pnpm test:composer for the isolated composer fixture.",
);
for (const dir of ["rtl", "ltr"])
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
    [390, 360],
    [1280, 800],
  ]) {
    test(`${dir} ${width}x${height}: submit stays reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/composer-layout-check");
      await page.locator("main").evaluate((el, d) => {
        el.setAttribute("dir", d);
      }, dir);
      const button = page.getByTestId("send-button");
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error("Submit button has no layout box");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await button.click();
      await expect(page.getByTestId("sent")).toHaveText("1");
    });
  }
