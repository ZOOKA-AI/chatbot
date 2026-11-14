import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("zooka-cookie-consent", "rejected")
  );
  await page.route("**/api/creative/capabilities", (route) =>
    route.fulfill({
      json: { image: { configured: false }, video: { configured: false } },
    })
  );
  await page.route("**/api/integration-hub", (route) =>
    route.fulfill({ status: 401, json: { error: "SIGN_IN_REQUIRED" } })
  );
});
test("local editor updates layers, autosaves, restores and exports SVG/PNG without provider calls", async ({
  page,
}) => {
  await page.goto("/creative");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("A real editable design");
  await expect(page.getByRole("img", { name: "Design canvas" })).toContainText(
    "A real editable design"
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("zooka-creative-designs-v1") ?? "[]"
          )[0]?.layers?.find((l: { id: string }) => l.id === "title")?.text
      )
    )
    .toBe("A real editable design");
  await page.reload();
  await expect(page.locator("svg[role=img]")).toContainText(
    "A real editable design"
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  const svgPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await svgPromise;
  expect(svg.suggestedFilename()).toBe("zooka-design.svg");
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  expect((await pngPromise).suggestedFilename()).toBe("zooka-design.png");
  await expect(
    page.getByRole("button", { name: "Generate one image", exact: true })
  ).toBeDisabled();
});
test("layer copies, ordering, undo/redo and template favorites do real local work", async ({
  page,
}) => {
  await page.goto("/creative");
  await page.getByRole("button", { name: "English", exact: true }).click();
  const before = await page.locator("svg[role=img] > g").count();
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await expect(page.locator("svg[role=img] > g")).toHaveCount(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("svg[role=img] > g")).toHaveCount(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("svg[role=img] > g")).toHaveCount(before + 1);
  await page
    .getByRole("button", { name: "Favorite", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Favorited", exact: true })
  ).toBeVisible();
});
test("untrusted design JSON is rejected without injecting scripts", async ({
  page,
}) => {
  await page.goto("/creative");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Import design", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        layers: [{ kind: "script", text: "bad" }],
      })
    ),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Invalid design" })
  ).toBeVisible();
});
for (const width of [390, 1280]) {
  test(`Creative Studio and Hub remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/creative");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ZOOKA AI CREATIVE STUDIO"
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page
      .getByRole("link", { name: "Integration Hub", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ZOOKA INTEGRATION HUB"
    );
    await expect(page.getByRole("status")).toContainText("SIGN_IN_REQUIRED");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search integrations" })
      .fill("GitHub");
    await expect(page.locator("[data-provider]")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Test actual read" })
    ).toBeDisabled();
  });
}

test("pointer dragging updates design coordinates and PNG contains actual raster bytes", async ({
  page,
}) => {
  await page.goto("/creative");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const before = Number(
    await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue()
  );
  const rectangle = page
    .locator('svg[role="img"] > g')
    .last()
    .locator("rect")
    .first();
  const box = await rectangle.boundingBox();
  if (!box) {
    throw new Error("Rectangle missing");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 45,
    box.y + box.height / 2 + 30,
    { steps: 6 }
  );
  await page.mouse.up();
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "X", exact: true })
        .inputValue()
    )
  ).toBeGreaterThan(before);
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  const stream = await (await promise).createReadStream();
  if (!stream) {
    throw new Error("Missing download stream");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("anonymous API calls return JSON 401 and configuration hints never claim verification", async ({
  request,
}) => {
  for (const path of ["/api/integration-hub", "/api/creative/overview"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe("SIGN_IN_REQUIRED");
  }
  const response = await request.get("/api/creative/capabilities");
  expect(response.status()).toBe(200);
  const config = await response.json();
  expect(config.image.verified).toBe(false);
  expect(config.video.verified).toBe(false);
});
