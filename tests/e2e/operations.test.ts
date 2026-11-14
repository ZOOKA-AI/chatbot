import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("zooka-cookie-consent", "rejected")
  );
});
test("command center exposes only implemented reads and labels proposed workers truthfully", async ({
  page,
}) => {
  await page.route("**/api/operations", (route) =>
    route.fulfill({ status: 403, json: { error: "WORKSPACE_ADMIN_REQUIRED" } })
  );
  await page.goto("/command-center");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ZOOKA COMMAND CENTER"
  );
  const build = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "/build", exact: true }),
  });
  await expect(build.getByRole("button")).toBeDisabled();
  const status = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "/status", exact: true }),
  });
  await status.getByRole("button").click();
  await expect(page.getByRole("status")).toContainText(
    "WORKSPACE_ADMIN_REQUIRED"
  );
  await expect(
    page.getByText("DESIGN ONLY · NOT RUNNING", { exact: true })
  ).toHaveCount(11);
});
test("actual unauthenticated operations API refuses reads and mutation requests", async ({
  request,
}) => {
  const response = await request.get("/api/operations", { maxRedirects: 0 });
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toBe("WORKSPACE_ADMIN_REQUIRED");
});
test("synthetic report is rendered and exported only after a user-initiated command", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/operations", async (route) => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON().command).toBe("/report");
    await route.fulfill({
      json: {
        report: {
          generatedAt: "2026-11-14T00:00:00.000Z",
          status: "PARTIAL",
          whatIsBroken: ["SYNTHETIC_FIXTURE"],
          dailySchedule: { enabled: false },
        },
        recorded: false,
      },
    });
  });
  await page.goto("/command-center");
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Generate report now", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText("SYNTHETIC_FIXTURE");
  await expect(page.getByRole("status")).toContainText("not recorded");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "zooka-operational-report.json"
  );
  expect(calls).toBe(1);
});
