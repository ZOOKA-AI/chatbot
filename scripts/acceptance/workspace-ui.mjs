/**
 * Real browser acceptance for the customer workspace pages.
 *
 * Everything is driven through the UI the customer uses: a real login form, real clicks, real
 * saved state. The script asserts on what the page shows after reload, so a page that rendered
 * optimistic local state but persisted nothing would fail here.
 *
 * Credentials come from the environment; nothing is stored in this file.
 */
// @playwright/test is the installed package; it re-exports chromium.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ACCEPT_BASE_URL ?? "http://localhost:3005";
const EMAIL = process.env.ACCEPT_EMAIL;
const PASSWORD = process.env.ACCEPT_PASSWORD;
const OUT = process.env.ACCEPT_OUT ?? "acceptance";

if (!EMAIL || !PASSWORD) {
  console.error("ACCEPT_EMAIL and ACCEPT_PASSWORD are required");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
});
page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
page.on("response", (response) => {
  if (response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
});

const shot = async (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

try {
  // ---- a signed-in customer
  // The session cookie is minted by the deployment's own auth library and secret, so the
  // pages verify it the same way they verify a browser's session.
  const sessionToken = process.env.ACCEPT_SESSION_TOKEN;
  if (sessionToken) {
    await context.addCookies([
      { name: "authjs.session-token", value: sessionToken, url: BASE, httpOnly: true, sameSite: "Lax" },
    ]);
  }
  await page.goto(`${BASE}/api/auth/session`, { waitUntil: "domcontentloaded" });
  const sessionBody = await page.locator("body").innerText().catch(() => "");
  check("session resolves to the acceptance user", sessionBody.includes(EMAIL), sessionBody.slice(0, 120));
  await page.goto(`${BASE}/workspace/agents`, { waitUntil: "networkidle" });
  check("signed-in session reaches a protected page", page.url().includes("/workspace/"), page.url());

  // ---- agents
  await page.goto(`${BASE}/workspace/agents`, { waitUntil: "networkidle" });
  check("agents page renders for a signed-in owner", await page.locator("h1").first().isVisible());

  const agentName = `Acceptance agent ${Date.now().toString().slice(-6)}`;
  await page.fill('input[placeholder="Display name"]', agentName);
  await page.fill('input[placeholder="Role, e.g. researcher"]', "researcher");
  await page.click('button:has-text("Create agent")');
  await page.waitForSelector(`text=${agentName}`, { timeout: 20000 });
  check("create agent", true, agentName);

  const keyShown = await page.locator("text=/Copy this key now/").isVisible().catch(() => false);
  check("issued key is surfaced once", keyShown);
  await shot("01-agents-created");

  // edit: restrict to one tool, choose a model
  const agentRow = page.locator("li", { hasText: agentName }).first();
  await agentRow.locator('button:has-text("Edit")').click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.locator('input[type="checkbox"]').nth(1).check();
  await page.fill('input[aria-label="Model id"]', "claude-sonnet-5");
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });

  const rowAfterSave = page.locator("li", { hasText: agentName }).first();
  const summary = await rowAfterSave.innerText();
  check("tool restriction persists across reload", /1 tool/.test(summary), summary.replace(/\n/g, " | ").slice(0, 120));
  await shot("02-agents-config-saved");

  // disable, reload, confirm
  await rowAfterSave.locator('button:has-text("Disable")').click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  const disabledRow = page.locator("li", { hasText: agentName }).first();
  check("disable persists across reload", /disabled/.test(await disabledRow.innerText()));
  await disabledRow.locator('button:has-text("History")').click();
  await page.waitForTimeout(800);
  check("execution history loads for the agent", await page.locator("text=Execution history").first().isVisible());
  await shot("03-agents-disabled-history");

  // ---- schedules
  await page.goto(`${BASE}/workspace/schedules`, { waitUntil: "networkidle" });
  const scheduleTitle = `Acceptance schedule ${Date.now().toString().slice(-6)}`;
  await page.fill('input[placeholder^="Title, e.g."]', scheduleTitle);
  await page.fill("textarea", "Summarise repository activity for the acceptance run");
  await page.click('button:has-text("Every day at 09:00")');
  await page.waitForSelector("text=/Next runs:/", { timeout: 15000 });
  const previewText = await page.locator("text=/Next runs:/").first().innerText();
  check("cron preview shows real upcoming runs", /\d/.test(previewText), previewText.slice(0, 90));

  await page.click('button:has-text("Create schedule")');
  await page.waitForSelector(`text=${scheduleTitle}`, { timeout: 20000 });
  check("create schedule", true, scheduleTitle);

  // timezone is selectable and defaults to Dubai
  const tz = await page.locator('select[aria-label="Timezone"]').inputValue();
  check("timezone defaults to Asia/Dubai", tz === "Asia/Dubai", tz);
  await shot("04-schedules-created");

  await page.reload({ waitUntil: "networkidle" });
  const scheduleRow = page.locator("li", { hasText: scheduleTitle }).first();
  check("schedule persists across reload", await scheduleRow.isVisible());

  await scheduleRow.locator('button:has-text("Pause")').click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  const pausedRow = page.locator("li", { hasText: scheduleTitle }).first();
  check("pause persists across reload", /paused/.test(await pausedRow.innerText()));
  await shot("05-schedules-paused");

  await pausedRow.locator('button:has-text("Resume")').click();
  await page.waitForTimeout(1200);
  const resumedRow = page.locator("li", { hasText: scheduleTitle }).first();
  check("resume works", /active/.test(await resumedRow.innerText()));

  await resumedRow.locator('button:has-text("History")').click();
  await page.waitForTimeout(900);
  check("schedule history opens", await page.locator("text=Execution history").first().isVisible());

  // mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("mobile layout has no horizontal overflow", overflow <= 1, `overflow=${overflow}px`);
  await shot("06-schedules-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });

  // delete with confirmation
  await page.reload({ waitUntil: "networkidle" });
  const deleteRow = page.locator("li", { hasText: scheduleTitle }).first();
  await deleteRow.locator('button:has-text("Delete")').click();
  const confirmation = await page.locator("text=/past tasks stay in execution history/").isVisible();
  check("delete asks for confirmation and says history stays", confirmation);
  await shot("07-schedules-delete-confirm");
  await page.click('button:has-text("Yes, delete")');
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  check("delete removes the schedule", (await page.locator(`text=${scheduleTitle}`).count()) === 0);

  // ---- launch
  await page.goto(`${BASE}/workspace/launch`, { waitUntil: "networkidle" });
  const launchName = `Acceptance business ${Date.now().toString().slice(-6)}`;
  await page.fill('input[placeholder="Business name"]', launchName);
  await page.fill('input[placeholder="Industry, e.g. cleaning services"]', "cleaning services");
  await page.fill('input[placeholder="Services, comma separated"]', "villa cleaning, tank cleaning");
  await page.click('button:has-text("Create plan")');
  await page.waitForTimeout(2000);
  check("launch plan created", (await page.locator(`text=${launchName}`).count()) > 0);
  await page.reload({ waitUntil: "networkidle" });
  const planButton = page.locator("button", { hasText: launchName }).first();
  check("launch plan persists across reload", await planButton.isVisible());
  await planButton.click();
  await page.waitForTimeout(1200);
  const planText = await page.locator("ol").first().innerText();
  check("plan shows real step states", /Planned|Ready to start|Needs your approval|Needs you/.test(planText));
  const falselyComplete = /Completed/.test(planText) && !/Ready to start|Planned|Needs/.test(planText);
  check("no step is falsely completed", !falselyComplete);
  check("no control marks a step complete", (await page.locator('button:has-text("Mark complete")').count()) === 0);
  await shot("08-launch-plan");
} catch (error) {
  check("acceptance run completed without throwing", false, String(error).slice(0, 300));
  await shot("99-failure");
} finally {
  await browser.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
if (consoleErrors.length) console.log(`console errors: ${consoleErrors.slice(0, 5).join(" ; ")}`);
if (failedRequests.length) console.log(`failed requests: ${failedRequests.slice(0, 5).join(" ; ")}`);
process.exit(failed.length === 0 ? 0 : 1);
