import { expect, test } from "@playwright/test";

test.describe("Authentication Pages", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      {
        name: "zooka_lang",
        value: "en",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
  });
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("user@acme.com")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sign in$/i })
    ).toBeVisible();
    await expect(page.getByText("Don't have an account?")).toBeVisible();
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByPlaceholder("user@acme.com")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sign up$/i })
    ).toBeVisible();
    await expect(page.getByText("Already have an account?")).toBeVisible();
  });

  test("can navigate from login to register", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Sign up/i }).click();
    await expect(page).toHaveURL("/register");
  });

  test("can navigate from register to login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL("/login");
  });

  test("OAuth callback errors are shown in the selected language", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    for (const [lang, message] of [
      [
        "en",
        "Unable to sign in. Please try again or use another sign-in method.",
      ],
      [
        "ar",
        "تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى أو استخدام طريقة أخرى.",
      ],
    ]) {
      await context.addCookies([
        { name: "zooka_lang", value: lang, url: page.url() },
      ]);
      await page.goto("/login?error=OAuthCallback");
      await expect(page.locator('p[role="alert"]:visible')).toHaveText(message);
      await page.goto("/login");
      await expect(page.locator('p[role="alert"]:visible')).toHaveCount(0);
    }
  });
});
