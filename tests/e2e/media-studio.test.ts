import { expect, test } from "@playwright/test";

test("media studio is transparent and saves, exports and clears a local brief", async ({
  page,
}) => {
  await page.goto("/dashboard/studio");
  await expect(
    page.getByRole("heading", { name: "استوديو الوسائط والخيال العلمي" })
  ).toBeVisible();
  const check = page.getByRole("button", { name: "حفظ الوصف محليًا" });
  await expect(check).toBeDisabled();
  await page.getByRole("button", { name: "استخدم مثالًا لهذا النوع" }).click();
  const prompt = page.getByLabel("وصف المشهد أو القصة");
  const original = await prompt.inputValue();
  await page.getByRole("button", { name: "حفظ الوصف محليًا" }).click();
  await page.reload();
  await page.getByRole("button", { name: "استعادة الوصف" }).click();
  await expect(prompt).toHaveValue(original);
  await prompt.fill("وصف جديد");
  await expect(
    page.getByRole("link", { name: "فتح استوديو مهام التوليد" })
  ).toHaveAttribute("href", "/workspace/studio");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير وصف JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "zooka-media-brief.json"
  );
  await page.getByRole("button", { name: "مسح المسودة" }).click();
  await expect(prompt).toHaveValue("");
  await expect(check).toBeDisabled();
});
