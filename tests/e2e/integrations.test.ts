import { expect, test } from "@playwright/test";

test("integrations settings require an authenticated workspace", async ({
  page,
}) => {
  await page.goto("/settings/integrations");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "تسجيل الدخول" })
  ).toBeVisible();
});
