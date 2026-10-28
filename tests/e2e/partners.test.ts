import { expect, test } from "@playwright/test";

test.describe("partner program", () => {
  test("shows the referral program and application path", async ({ page }) => {
    await page.goto("/partners");
    await page.getByRole("button", { name: "English" }).click();

    await expect(
      page.getByRole("heading", { name: "Earn with Zooka AI" })
    ).toBeVisible();
    await expect(page.getByText("20%").last()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Join as Partner" })
    ).toHaveAttribute("href", "/partners/join");
    await expect(page.getByText(/not active yet/i)).toBeVisible();
  });

  test("renders a validated partner application form", async ({ page }) => {
    await page.goto("/partners");
    await page.getByRole("button", { name: "English" }).click();
    await page.goto("/partners/join");

    await expect(
      page.getByRole("heading", { name: "Partner application" })
    ).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
    await expect(
      page.getByRole("button", { name: "Prepare application email" })
    ).toBeVisible();
  });
});
