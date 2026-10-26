import { expect, test } from "@playwright/test";

test("pricing page lists the three monthly workspace plans", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "zooka_lang",
      value: "en",
      url: "http://localhost:3000",
    },
  ]);
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
  await expect(page.getByText("500 agent runs per month")).toBeVisible();
  await expect(page.getByText("5,000 agent runs per month")).toBeVisible();
});
