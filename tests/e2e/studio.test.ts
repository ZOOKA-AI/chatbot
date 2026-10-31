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
  const guide = page.getByRole("dialog", {
    name: "دليل ربط WhatsApp Business",
  });
  await expect(guide).toContainText("لا يوجد موصل منفّذ");
  await expect(
    guide.getByRole("link", { name: "وثائق المزوّد" }),
  ).toHaveAttribute("href", /postman.com\/meta/);
  await guide.getByRole("button", { name: "إغلاق دليل الربط" }).click();
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

test("task board persists real manual state and deletes with confirmation", async ({
  page,
}) => {
  await page.goto("/studio/tasks");
  await page
    .getByRole("textbox", { name: "المهمة", exact: true })
    .fill("مراجعة الموقع");
  await page.getByLabel("الأولوية", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "إضافة مهمة" }).click();
  await page
    .getByRole("combobox", { name: "حالة مراجعة الموقع" })
    .selectOption("doing");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "قيد العمل", exact: true }),
  ).toContainText("مراجعة الموقع");
  await expect(
    page.getByRole("combobox", { name: "حالة مراجعة الموقع" }),
  ).toHaveValue("doing");
  await page
    .getByRole("combobox", { name: "حالة مراجعة الموقع" })
    .selectOption("done");
  await expect(
    page.getByRole("region", { name: "مكتملة", exact: true }),
  ).toContainText("مراجعة الموقع");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "حذف المهمة مراجعة الموقع" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("imports HTML and restores a backup as new copies without overwriting", async ({
  page,
}) => {
  await page.goto("/studio/projects");
  await expect(
    page.getByRole("button", { name: "استيراد HTML" }),
  ).toBeEnabled();
  await page.getByLabel("ملف HTML للاستيراد").setInputFiles({
    name: "imported.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>موقع مستورد</h1>"),
  });
  await expect(
    page.getByRole("heading", { name: "imported", exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "نسخة احتياطية" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^zooka-projects-.*\.json$/);
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString()).projects).toHaveLength(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("ملف النسخة الاحتياطية").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(
    page.getByRole("heading", { name: "imported", exact: true }),
  ).toHaveCount(2);
  const links = page.getByRole("link", { name: "فتح المحرر" });
  const ids = await links.evaluateAll((elements) =>
    elements.map((a) => a.getAttribute("href")),
  );
  expect(new Set(ids).size).toBe(2);
  await page.getByLabel("ملف النسخة الاحتياطية").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"wrong"}'),
  });
  await expect(page.getByRole("status")).toContainText("ليس ملف نسخة احتياطية");
  await expect(links).toHaveCount(2);
});

test("local playground runs a real quiz and two-player game", async ({
  page,
}) => {
  await page.goto("/studio/play");
  await page.getByRole("button", { name: "h1", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("إجابة صحيحة");
  await page.getByRole("button", { name: "السؤال التالي" }).click();
  await expect(
    page.getByRole("heading", {
      name: "ما الذي لا يجب وضعه في كود المتصفح العام؟",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /تحدي X و O/ }).click();
  for (const i of [1, 4, 2, 5, 3])
    await page
      .getByRole("button", { name: `الخانة ${i}: فارغة`, exact: true })
      .click();
  await expect(page.getByRole("status")).toContainText("فاز اللاعب X");
  await expect(
    page.getByRole("button", { name: "الخانة 6: فارغة", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "جولة جديدة" }).click();
  await expect(page.getByRole("status")).toContainText("الدور على اللاعب X");
  await page.getByRole("button", { name: /شرارة فكرة/ }).click();
  const before = await page.locator("blockquote").textContent();
  await page.getByRole("button", { name: "فكرة أخرى" }).click();
  expect(await page.locator("blockquote").textContent()).not.toBe(before);
});

test("creative quiz template has working native disclosure in sandbox", async ({
  page,
}) => {
  await page.goto("/studio/code?template=quiz");
  const frame = page.frameLocator('iframe[title="معاينة الموقع المعزولة"]');
  await frame.locator("summary").first().click();
  await expect(frame.locator("details[open]")).toHaveCount(1);
  await expect(frame.locator("details[open]")).toContainText("CSS");
});
