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
// No credentials live in this file. Point these at a throwaway account you seeded into the
// isolated acceptance database; the run refuses to start without them rather than guessing.
const EMAIL = process.env.ACCEPT_EMAIL;
const PASSWORD = process.env.ACCEPT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("ACCEPT_EMAIL and ACCEPT_PASSWORD must be set for the acceptance run.");
  process.exit(2);
}
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
// A trace makes a failure reproducible instead of merely described.
await context.tracing.start({ screenshots: true, snapshots: true });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 160)));

const submitted = async (label) => {
  const response = page.waitForResponse((r) => r.request().method() !== "GET", { timeout: 15000 }).catch(() => null);
  return response;
};

try {
  // ---- the real sign-in a customer performs: fill the form and submit it
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  const cookiesAfterLogin = (await context.cookies()).map((c) => c.name);
  check(
    "the login form establishes a session cookie",
    cookiesAfterLogin.some((name) => name.includes("session-token")),
    cookiesAfterLogin.join(", ") || "(no cookies)"
  );
  check("the login form leaves the login page", !new URL(page.url()).pathname.startsWith("/login"), new URL(page.url()).pathname);
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
  // ---- projects: create from the UI, reload, and read the real detail back
  await page.goto(`${BASE}/workspace/projects`, { waitUntil: "networkidle" });
  const projectName = `Acceptance project ${stamp}`;
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Project summary").fill("Created by the acceptance run");
  await page.getByRole("button", { name: /Create/i }).first().click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const projectsText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/projects.png`, fullPage: true });
  check("project created through the UI survives a reload", projectsText.includes(projectName), projectName);
  check("projects page reports a real count", /Projects \(\d+\)/.test(projectsText), (projectsText.match(/Projects \(\d+\)/) || [""])[0]);

  // Opening the project must show its real rollup, not a placeholder.
  await page.getByRole("button", { name: new RegExp(projectName.split(" ").pop()) }).first().click();
  await page.waitForTimeout(2000);
  const detailText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/project-detail.png`, fullPage: true });
  check(
    "opening a project shows its tasks and execution record",
    /Tasks \(\d+\)/.test(detailText) && /Execution evidence \(\d+\)/.test(detailText),
    (detailText.match(/Tasks \(\d+\)|Execution evidence \(\d+\)/g) || []).join(" ")
  );
  check(
    "a project with no work says so rather than implying success",
    /No tasks yet|Nothing has executed yet/.test(detailText)
  );

  // ---- actions: the catalog renders, and execution is withheld when no agent holds the tool
  await page.goto(`${BASE}/workspace/actions`, { waitUntil: "networkidle" });
  const actionsText = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/actions.png`, fullPage: true });
  check("the action catalog lists a versioned action", /v\d+/.test(actionsText));
  check("the catalog is Arabic-first", /[\u0600-\u06FF]/.test(actionsText));
  const openButton = page.getByRole("button", { name: /Open/i }).first();
  const hasCatalogEntry = (await openButton.count()) > 0;
  check("an action can be opened for its details", hasCatalogEntry);
  if (hasCatalogEntry) {
    await openButton.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/action-detail.png`, fullPage: true });
    const runButton = page.getByRole("button", { name: /Run/i }).first();
    const disabled = (await runButton.count()) === 0 ? true : await runButton.isDisabled();
    const detailBody = await page.locator("body").innerText();
    // New agents are created with no tools, so nothing here can be executed yet. The page must
    // say that instead of offering a button that would fail on the server.
    check(
      "execution is withheld while no agent on the project holds the tool",
      disabled || /Needs an agent with the tool|no agent on this project holds the tool/.test(detailBody),
      disabled ? "run control is disabled" : "page states the missing assignment"
    );
  }

} catch (error) {
  check("acceptance run completed without throwing", false, String(error).slice(0, 200));
} finally {
  await context.tracing.stop({ path: `${OUT}/trace.zip` }).catch(() => {});
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${passed}/${results.length} passed`);
if (pageErrors.length > 0) console.log("page errors:", pageErrors.slice(0, 3).join(" | "));
process.exit(passed === results.length ? 0 : 1);
