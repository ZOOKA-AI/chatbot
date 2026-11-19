import { expect, test } from "@playwright/test";

for (const path of ["/lp/agents", "/lp/teams"]) {
  for (const width of [390, 1280]) {
    test(`${path} offers honest entry points at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "ابدأ بإنشاء حساب" })
      ).toHaveAttribute("href", "/register");
      await expect(
        page.getByRole("link", { name: "استكشف القوالب أولاً" })
      ).toHaveAttribute("href", "/studio");
      await expect(
        page.getByText("مثال توضيحي — ليس تنفيذاً فعلياً")
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    });
  }
}
