/**
 * Browser acceptance for the three workspace pages.
 *
 * Signs in with the customer's real credentials through the application's own Auth.js
 * credentials endpoint, then exercises each page as a customer would: create a record, reload,
 * and confirm it is still there. A page passes only if it renders for the session, shows its own
 * content, and the created record survives a reload. Screenshots are written to acceptance/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.ACCEPT_BASE_URL || "https://localhost:3443";
const EMAIL = process.env.ACCEPT_EMAIL || "owner@acceptance.local";
const PASSWORD = process.env.ACCEPT_PASSWORD || "AcceptanceTest2026!";
const OUT = "acceptance";
const stamp = Date.now().toString().slice(-6);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 160)));

const submitted = async (label) => {
  const response = page.waitForResponse((r) => r.request().method() !== "GET", { timeout: 15000 }).catch(() => null);
  return response;
};

try {
  const csrf = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
  const signIn = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: { csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/workspace/agents` },
    maxRedirects: 0,
  });
  check("credentials accepted by the app's own auth", signIn.status() === 302, `status ${signIn.status()}`);
  const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
  check("session resolves to the signing customer", session?.user?.email === EMAIL, String(session?.user?.email ?? null));

  // ---- agents: create, then confirm persistence across a reload
  await page.goto(`${BASE}/workspace/agents`, { waitUntil: "networkidle" });
  const agentName = `Acceptance agent ${stamp}`;
  await page.getByPlaceholder("Display name").fill(agentName);
  const roleField = page.getByPlaceholder(/researcher/i);
  if (await roleField.count()) await roleField.fill("acceptance");
  await page.getByRole("button", { name: /create agent/i }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const agentsText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/agents.png`, fullPage: true });
  check("agent created through the UI is listed", agentsText.includes(agentName), agentName);
  check("agents page shows the agent count", /Agents \(\d+\)/.test(agentsText), (agentsText.match(/Agents \(\d+\)/) || [""])[0]);

  // ---- schedules: create, then confirm persistence across a reload
  await page.goto(`${BASE}/workspace/schedules`, { waitUntil: "networkidle" });
  const scheduleTitle = `Acceptance schedule ${stamp}`;
  const instruction = page.getByPlaceholder(/What should run each time/i);
  await instruction.fill("Collect the weekly repository report and post the summary.");
  await page.getByPlaceholder(/Title, e.g. Weekly repository report/i).fill(scheduleTitle);
  const cronField = page.getByPlaceholder(/Cron expression/i).first();
  if (await cronField.count()) await cronField.fill("0 9 * * 1");
  // The create control stays disabled until the scheduler itself accepts the expression.
  const createSchedule = page.getByRole("button", { name: /create schedule|create/i }).first();
  await page.waitForTimeout(2000);
  await createSchedule.click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const schedulesText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/schedules.png`, fullPage: true });
  check("schedule created through the UI is listed", schedulesText.includes(scheduleTitle), scheduleTitle);
  check("schedules page reports a real state, not a promise", /Schedules \(\d+\)/.test(schedulesText), (schedulesText.match(/Schedules \(\d+\)/) || [""])[0]);

  // ---- launch: create a plan and confirm it is persisted with real step states
  await page.goto(`${BASE}/workspace/launch`, { waitUntil: "networkidle" });
  const planName = `Acceptance plan ${stamp}`;
  await page.getByPlaceholder(/Business name/i).fill(planName);
  const industry = page.getByPlaceholder(/cleaning services/i);
  if (await industry.count()) await industry.fill("cleaning");
  const city = page.getByPlaceholder(/city/i).first();
  if (await city.count()) await city.fill("Dubai");
  await page.getByRole("button", { name: /create plan/i }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const launchText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/launch.png`, fullPage: true });
  check("launch plan created through the UI is listed", launchText.includes(planName), planName);
  check("launch page shows persisted plans", /Launch plans \(\d+\)/.test(launchText), (launchText.match(/Launch plans \(\d+\)/) || [""])[0]);
} catch (error) {
  check("acceptance run completed without throwing", false, String(error).slice(0, 200));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${passed}/${results.length} passed`);
if (pageErrors.length > 0) console.log("page errors:", pageErrors.slice(0, 3).join(" | "));
process.exit(passed === results.length ? 0 : 1);
