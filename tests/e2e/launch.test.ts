import { expect, test } from "@playwright/test";
import {
  defaultWorkspaceNameForEmail,
  displayWorkspaceName,
  isPlaceholderWorkspaceName,
} from "@/lib/workspace-name";

test.describe("Workspace names", () => {
  test("numeric identifiers are replaced by a friendly default", () => {
    expect(isPlaceholderWorkspaceName("1792738151875")).toBe(true);
    expect(isPlaceholderWorkspaceName("guest-1792738151875's workspace")).toBe(
      true
    );
    expect(isPlaceholderWorkspaceName("Acme Team")).toBe(false);
    expect(displayWorkspaceName("1792738151875", "ar")).toBe("مساحة عمل جديدة");
    expect(displayWorkspaceName("Acme Team", "ar")).toBe("Acme Team");
    expect(defaultWorkspaceNameForEmail("guest-1792738151875")).toBe(
      "مساحة عمل جديدة"
    );
    expect(defaultWorkspaceNameForEmail("sara@example.com")).toBe(
      "sara's workspace"
    );
  });
});

test.describe("SEO and Open Graph", () => {
  test("robots.txt references the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(
      "Sitemap: https://zooka-ai.com/sitemap.xml"
    );
  });

  test("sitemap lists the pricing page", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("https://zooka-ai.com/pricing");
  });

  test("pricing page exposes Open Graph and Twitter metadata", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Zooka AI"
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image"
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://zooka-ai.com/pricing"
    );
  });
});

test.describe("Billing and workspace APIs", () => {
  test("stripe webhook rejects unsigned requests", async ({ request }) => {
    const response = await request.post("/api/stripe/webhook", {
      data: "{}",
    });
    expect([400, 503]).toContain(response.status());
  });

  test("workspace rename requires authentication", async ({ request }) => {
    const response = await request.patch("/api/workspace", {
      data: { name: "Acme" },
      maxRedirects: 0,
    });
    expect(response.status()).not.toBe(200);
  });
});

test.describe("Guest paywall", () => {
  test("shows the sign up modal once the free messages are used", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("zooka_guest_messages", "3");
    });
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();

    const paywall = page.getByTestId("guest-paywall");
    await expect(paywall).toBeVisible();
    await expect(paywall.getByRole("link", { name: "إنشاء حساب" })).toBeVisible();
    await expect(paywall.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(paywall.getByRole("link", { name: "عرض الخطط" })).toBeVisible();
  });

  test("guests see the upgrade button in the header and sidebar", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("upgrade-button").first()).toHaveAttribute(
      "href",
      "/pricing"
    );
  });
});
