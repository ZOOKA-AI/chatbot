import { expect, test } from "@playwright/test";

/**
 * Experience 2.0 public surfaces: AI TV, support center, header menu and the
 * layout at the widths the brief lists. No sign-in and no database needed.
 */
const WIDTHS = [360, 390, 430, 768, 1280, 1440, 1920];
const PAGES = ["/", "/tv", "/support", "/social", "/login"];

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    for (const path of PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      );
      expect(overflow, `${path} at ${width}px`).toBe(false);
    }
  });
}

test("mobile menu closes on Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator("header button[aria-controls]").first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("AI TV plays a brand video with captions and an English cut", async ({
  page,
}) => {
  await page.goto("/tv");
  const player = page.getByTestId("tv-player");
  await expect(player).toBeVisible();
  await expect(player.locator("video track")).toHaveCount(2);
  await player.getByRole("button", { name: "English" }).click();
  await expect(
    player.locator('video source[src$="-en-1920x1080.mp4"]')
  ).toHaveCount(1);
  const played = await page.evaluate(async () => {
    const video = document.querySelector("video");
    if (!video) {
      return 0;
    }
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return video.currentTime;
  });
  expect(played).toBeGreaterThan(0.3);
});

test("support center makes no 24/7 live-support claim", async ({ page }) => {
  await page.goto("/support");
  await expect(page.locator("h1")).toBeVisible();
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text).not.toMatch(/24\/7 (live )?support available/);
  await expect(
    page.locator('a[href="mailto:support@zooka-ai.com"]').first()
  ).toBeVisible();
});

test("settings hub requires sign-in", async ({ page }) => {
  const response = await page.goto("/settings");
  expect(page.url()).not.toMatch(/\/settings$/);
  expect(response?.ok()).toBe(true);
});
