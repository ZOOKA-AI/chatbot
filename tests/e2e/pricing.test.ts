import { expect, test } from "@playwright/test";

test("pricing page lists the three monthly workspace plans", async ({
  page,
}) => {
  await page.goto("/pricing");

  await expect(
    page.getByRole("heading", { name: "Choose the right workspace plan" })
  ).toBeVisible();
  await expect(page.getByText("$19")).toBeVisible();
  await expect(page.getByText("$49")).toBeVisible();
  await expect(
    page.getByText("1,000 messages per month").first()
  ).toBeVisible();
  await expect(page.getByText("Advanced models")).toBeVisible();
  await expect(page.getByText("Priority support")).toBeVisible();
});
