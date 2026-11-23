import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  for (const signedIn of [false, true]) {
    test(`social header resolves ${signedIn ? "signed-in" : "signed-out"} session on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }) => {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      );
      let releaseSession!: () => void;
      const sessionReady = new Promise<void>((resolve) => {
        releaseSession = resolve;
      });
      await page.route("**/api/auth/session", async (route) => {
        await sessionReady;
        await route.fulfill({
          json: signedIn
            ? {
                user: { id: "user-1", type: "regular" },
                expires: "2099-01-01T00:00:00.000Z",
              }
            : null,
        });
      });

      await page.goto("/social", { waitUntil: "domcontentloaded" });
      const header = page.locator("header").first();
      const area = header.locator("div.grid").first();
      await expect(area).toBeVisible();
      await expect(header.getByRole("link", { name: "تسجيل الدخول" })).toHaveCount(0);
      const before = await area.boundingBox();
      releaseSession();

      if (signedIn) {
        await expect(header.getByRole("link", { name: "مساحة عملك" })).toBeVisible();
        await expect(header.getByRole("link", { name: "تسجيل الدخول" })).toHaveCount(0);
        await expect(header.getByRole("link", { name: "أنشئ مساحة عملك" })).toHaveCount(0);
      } else {
        await expect(header.getByRole("link", { name: "أنشئ مساحة عملك" })).toBeVisible();
        if (!mobile) {
          await expect(header.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
        }
      }

      const after = await area.boundingBox();
      expect(after).toEqual(before);

      if (mobile) {
        await header.getByRole("button", { name: "القائمة" }).click();
        const menu = header.locator("#site-mobile-menu");
        const accountLink = menu.getByRole("link", {
          name: signedIn ? "مساحة عملك" : "تسجيل الدخول",
        });
        await expect(accountLink).toHaveAttribute(
          "href",
          signedIn ? "/workspace" : "/login"
        );
        if (signedIn) {
          await expect(menu.getByRole("link", { name: "تسجيل الدخول" })).toHaveCount(0);
        }
      }
    });
  }
}
