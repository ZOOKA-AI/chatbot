import { expect, test } from "@playwright/test";
test("command alias reaches the existing login gate and admin is not public", async ({ page, request }) => {
  const alias = await request.get("/chatbot", { maxRedirects: 0 });
  expect([307, 308]).toContain(alias.status());
  expect(alias.headers().location).toContain("/workspace/agent");
  await page.goto("/chatbot");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});
