import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window)
      localStorage.setItem("zooka-cookie-consent", "rejected");
  });
});
test("visitor home connects public and internal tools without losing the return path", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "فكّر بطموح. وابنِ بوضوح." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "ابدأ من مساحة العمل", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "مساحة واحدة. لاحتمالات أكبر." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "روابط المنصة" })
    .getByRole("link", { name: "الجاهزية والحدود" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "ما الذي يعمل، وما الذي يحتاج خطوة أخرى؟",
    }),
  ).toBeVisible();
  await expect(page.getByText("غير متصل", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "تنقل المنصة" })
    .getByRole("link", { name: "القوالب", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "قوالب تصنع انطلاقتك" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(6);
});

test("mobile public navigation has no overflow or placeholder links and FAQ expands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");
  await page
    .getByText("هل كل الأدوات والتكاملات مفعّلة؟", { exact: true })
    .click();
  await expect(page.locator("details[open]")).toContainText(
    "ظهور الشعار لا يعني اتصال حسابك",
  );
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const nav = page.getByRole("navigation", { name: "تنقل المنصة" });
  await expect(
    nav.getByRole("link", { name: "الباقات", exact: true }),
  ).toHaveAttribute("href", "/pricing");
  await nav.getByRole("link", { name: "التكاملات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "مركز التكاملات" }),
  ).toBeVisible();
});

test("English platform content and readiness use the language cookie", async ({
  page,
}) => {
  await page.goto("/explore");
  await page
    .context()
    .addCookies([
      { name: "zooka_lang", value: "en", url: new URL(page.url()).origin },
    ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Think boldly. Build clearly." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Platform navigation" })
    .getByRole("link", { name: "Readiness", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "What works, and what needs another step?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
});
