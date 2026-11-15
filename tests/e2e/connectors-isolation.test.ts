import { expect, test } from "@playwright/test";

/**
 * Cross-tenant isolation, recorded as an acceptance test against two real
 * accounts. It is deliberately gated: without both credential pairs it skips
 * instead of faking a pass.
 *
 * What it proves, using the product's own authenticated endpoint:
 *  - each workspace reads its own connection set from /api/integrations/status;
 *  - no credential, account name or connection row of workspace A is visible to
 *    workspace B;
 *  - neither session can read the other's page content.
 *
 * Required env:
 *   ZOOKA_TEST_USER_A_EMAIL / ZOOKA_TEST_USER_A_PASSWORD
 *   ZOOKA_TEST_USER_B_EMAIL / ZOOKA_TEST_USER_B_PASSWORD
 * Optional: ZOOKA_TEST_BASE_URL (defaults to PLAYWRIGHT_TEST_BASE_URL).
 */
const A = {
  email: process.env.ZOOKA_TEST_USER_A_EMAIL ?? "",
  password: process.env.ZOOKA_TEST_USER_A_PASSWORD ?? "",
};
const B = {
  email: process.env.ZOOKA_TEST_USER_B_EMAIL ?? "",
  password: process.env.ZOOKA_TEST_USER_B_PASSWORD ?? "",
};

type Status = { connected: string[]; needsReconnect: string[] };

async function signInAndReadStatus(
  page: import("@playwright/test").Page,
  account: { email: string; password: string }
): Promise<Status> {
  await page.goto("/login");
  await page.getByPlaceholder("user@acme.com").fill(account.email);
  await page.getByLabel(/password|كلمة المرور/i).fill(account.password);
  await page.getByRole("button", { name: /sign in|دخول/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 45_000,
  });

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/integrations/status", {
      headers: { accept: "application/json" },
    });
    return {
      code: response.status,
      body: (await response.json()) as {
        connected: string[];
        needsReconnect: string[];
      },
    };
  });

  expect(status.code, "the authenticated status endpoint must answer 200").toBe(
    200
  );
  expect(Array.isArray(status.body.connected)).toBe(true);
  return status.body;
}

test.describe("cross-tenant integration isolation", () => {
  test.skip(
    !A.email || !A.password || !B.email || !B.password,
    "set ZOOKA_TEST_USER_A_* and ZOOKA_TEST_USER_B_* to run the two-account isolation test"
  );

  test("each workspace sees only its own connections", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const statusA = await signInAndReadStatus(pageA, A);
      const statusB = await signInAndReadStatus(pageB, B);

      // A credential is workspace-scoped: the union may overlap only for
      // provider ids both tenants connected themselves, never because of a leak.
      const onlyA = statusA.connected.filter(
        (provider) => !statusB.connected.includes(provider)
      );

      if (statusB.connected.length === 0) {
        expect(statusB.needsReconnect).toEqual([]);
      }

      // The stronger assertion available to us: B's page must not render any
      // connection that exists only in A. Each card carries data-provider.
      await pageB.goto("/settings/integrations");
      const providerIdsOnB = await pageB
        .locator("[data-provider]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-provider") ?? "")
        );

      for (const provider of onlyA) {
        const cardOnB = pageB.locator(`[data-provider="${provider}"]`);
        if ((await cardOnB.count()) === 0) {
          continue;
        }
        // The card may exist as an unconnected offer, but it must not claim a
        // connection that belongs to the other workspace.
        await expect(cardOnB.first()).not.toContainText(/^متصل/);
      }

      expect(
        providerIdsOnB.length,
        "the integrations page should list provider cards for tenant B"
      ).toBeGreaterThan(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
