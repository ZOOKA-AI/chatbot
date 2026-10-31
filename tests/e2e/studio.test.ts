import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window)
      localStorage.setItem("zooka-cookie-consent", "rejected");
  });
});

test("edits, previews, saves and reopens a local project", async ({ page }) => {
  await page.goto("/studio/templates");
  await page.getByRole("button", { name: /موقع شركة خدمات/ }).click();
  await expect(
    page.getByRole("heading", { name: "الكود، ثم النتيجة" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "الكود", exact: true }).click();
  await page
    .getByRole("textbox", { name: "كود HTML" })
    .fill('<h1 lang="ar">مشروعي التجريبي</h1>');
  await page
    .getByRole("textbox", { name: "اسم المشروع" })
    .fill("مشروع المراجعة");
  await page.getByRole("button", { name: "تحديث المعاينة" }).click();
  await expect(
    page
      .frameLocator('iframe[title="معاينة الموقع المعزولة"]')
      .getByRole("heading", { name: "مشروعي التجريبي" }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  await page.getByRole("button", { name: "حفظ محلي" }).click();
  await expect(page.getByRole("status")).toContainText("حُفظ المشروع");
  await page.goto("/studio/projects");
  await page.getByRole("link", { name: "فتح المحرر" }).click();
  await expect(page.getByRole("textbox", { name: "اسم المشروع" })).toHaveValue(
    "مشروع المراجعة",
  );
  await page.getByRole("button", { name: "الكود", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "كود HTML" })).toHaveValue(
    '<h1 lang="ar">مشروعي التجريبي</h1>',
  );
});

test("searches inactive integrations without pretending to connect", async ({
  page,
}) => {
  await page.goto("/studio/integrations");
  await page.getByRole("searchbox").fill("WhatsApp");
  const card = page.getByRole("article");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("غير مفعّل");
  await card.getByRole("button", { name: "متطلبات التفعيل" }).click();
  await expect(page.getByRole("status")).toContainText("لا يوجد موصل منفّذ");
  await page.getByRole("searchbox").fill("n8n");
  await expect(card).toContainText("مسار ربط متاح");
  await expect(
    card.getByRole("link", { name: "فتح إعداد الربط" }),
  ).toHaveAttribute("href", "/settings/integrations");
});

test("mobile navigation opens a keyboard-dismissible create sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page.getByRole("button", { name: /إنشاء جديد/ }).click();
  await expect(
    page.getByRole("dialog", { name: "ماذا تريد أن تبدأ؟" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "ماذا تريد أن تبدأ؟" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
