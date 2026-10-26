import { expect, test } from "@playwright/test";

test("workspace settings and billing show the current tenant", async ({
  page,
}) => {
  await page.goto("/workspace");

  await expect(page.getByText("Current workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspace settings" })
  ).toBeVisible();

  await page.getByRole("link", { name: "Plan and usage" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan and usage" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free plan" })).toBeVisible();
  await expect(page.getByText(/Chat messages this month:/)).toBeVisible();
  await expect(page.getByText(/Agent runs this month:/)).toBeVisible();
});
