import { expect, test } from "@playwright/test";

test("narrow navigation shows the three areas in Arabic RTL", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("sidebar-toggle-button").click();

  const navigation = page.getByRole("navigation", { name: "التنقل الرئيسي" });
  await expect(navigation.getByText("الوكلاء", { exact: true })).toBeVisible();
  await expect(navigation.getByText("العمل", { exact: true })).toBeVisible();
  await expect(
    navigation.getByText("مساحة العمل", { exact: true })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("English navigation uses LTR direction", async ({ page }) => {
  await page.goto("/");
  await page.context().addCookies([
    {
      name: "zooka_lang",
      value: "en",
      url: new URL(page.url()).origin,
    },
  ]);
  await page.reload();
  await page.getByTestId("sidebar-toggle-button").click();

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByText("Agents", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Work", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
