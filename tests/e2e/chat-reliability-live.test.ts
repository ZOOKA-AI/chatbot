import { expect, test } from "@playwright/test";
import { chatModels } from "@/lib/ai/models";

const isConfigured =
  process.env.LIVE_CHAT_E2E === "1" &&
  Boolean(process.env.CHAT_E2E_EMAIL) &&
  Boolean(process.env.CHAT_E2E_PASSWORD);

test.skip(
  !isConfigured,
  "Set LIVE_CHAT_E2E=1 and test-account credentials to run live model checks."
);

test("each enabled model completes 20 sequential Arabic turns", async ({
  page,
}) => {
  test.setTimeout(60 * 60 * 1000);

  await page.goto("/login");
  await page
    .getByPlaceholder("user@acme.com")
    .fill(process.env.CHAT_E2E_EMAIL ?? "");
  await page.getByLabel("Password").fill(process.env.CHAT_E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByTestId("multimodal-input")).toBeVisible();

  const configuredIds = process.env.LIVE_CHAT_E2E_MODELS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const enabledModels = configuredIds
    ? chatModels.filter((model) => configuredIds.includes(model.id))
    : chatModels;
  expect(enabledModels.length).toBeGreaterThan(0);

  for (const model of enabledModels) {
    await page.goto("/");
    await page.getByRole("button", { name: model.name }).click();
    await page.getByRole("option", { name: model.name }).click();

    for (let turn = 0; turn < 20; turn += 1) {
      const marker = `ZOOKA-CHECK-${turn + 1}-${Date.now()}`;
      const input = page.getByTestId("multimodal-input");
      await input.fill(
        `اكتب تحية عربية قصيرة واختم الرد حرفياً بالرمز ${marker} ولا تكتب شيئاً بعده.`
      );
      await page.getByTestId("send-button").click();

      const assistantResponse = page
        .getByTestId("message-content")
        .nth(turn * 2 + 1);
      await expect(assistantResponse).toContainText(marker, {
        timeout: 60_000,
      });
      await expect(assistantResponse).not.toBeEmpty();
    }
  }
});
