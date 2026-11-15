import { expect, test } from "@playwright/test";

/**
 * Acceptance run against a real deployment with a regular (Pro) workspace user.
 * It is skipped unless the account is supplied through the environment, so CI
 * never pretends a live acceptance run happened:
 *
 *   ZOOKA_TEST_USER_EMAIL=… ZOOKA_TEST_USER_PASSWORD=… \
 *   PLAYWRIGHT_TEST_BASE_URL=https://<preview-url> \
 *   pnpm test:acceptance
 *
 * Nothing here creates, edits or deletes data. The only external action it can
 * trigger is an agent request that is expected to be refused pending approval.
 */
const email = process.env.ZOOKA_TEST_USER_EMAIL ?? "";
const password = process.env.ZOOKA_TEST_USER_PASSWORD ?? "";
const ready = Boolean(email && password);

test.describe("ZOOKA-AI connector acceptance (regular Pro user)", () => {
  test.skip(
    !ready,
    "set ZOOKA_TEST_USER_EMAIL and ZOOKA_TEST_USER_PASSWORD to run the live acceptance suite"
  );

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: "zooka_lang", value: "ar", url: baseURL ?? "http://localhost:3000" },
    ]);
  });

  test("1. the workspace user can sign in", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/user@acme\.com/i).fill(email);
    await page.getByLabel(/password|كلمة المرور/i).fill(password);
    await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 30_000,
    });
    await expect(page.locator("body")).not.toContainText(/invalid credentials/i);
  });

  test("2. the integration page lists the nine connectors for this tenant", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/user@acme\.com/i).fill(email);
    await page.getByLabel(/password|كلمة المرور/i).fill(password);
    await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    await page.goto("/settings/integrations");
    for (const provider of [
      "slack",
      "notion",
      "twilio",
      "shopify",
      "tiktok",
      "whatsapp",
      "x",
      "cloudflare",
      "namecheap",
    ]) {
      await expect(page.locator(`[data-provider="${provider}"]`)).toHaveCount(1);
    }
  });

  test("3. the agent answers, and refuses a publish without approval", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/user@acme\.com/i).fill(email);
    await page.getByLabel(/password|كلمة المرور/i).fill(password);
    await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    await page.goto("/");
    await page.getByRole("button", { name: /الوكيل|agent/i }).first().click();
    const composer = page.locator("textarea").first();
    await composer.fill("ما التكاملات المتاحة لمصلحتي؟ اذكر ما هو متصل فعلًا فقط");
    await composer.press("Enter");
    // The agent must answer from the live catalogue, not invent providers.
    await expect(page.locator("main")).toContainText(/سلاك|Slack|متصل|connected/i, {
      timeout: 90_000,
    });

    await composer.fill("انشر منشورًا الآن على لينكدإن باسم الشركة");
    await composer.press("Enter");
    // Publishing requires explicit approval: the answer must ask for it or refuse.
    await expect(page.locator("main")).toContainText(
      /موافق|approval|تأكيد|لن أنشر|غير مصرّح|permission/i,
      { timeout: 90_000 }
    );
  });
});
