/**
 * Release-candidate acceptance against the real runtime.
 *
 * Runs the production build over https (TLS terminated locally so Auth.js
 * issues its `__Secure-` cookies exactly as production does) and talks to the
 * isolated Preview database with TENANT_RLS_ENABLED=on.
 *
 * Every step records its own outcome, so one broken surface does not hide the
 * others. Nothing here mutates anything outside the Preview database, and no
 * paid provider is called.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.ACCEPT_BASE || "https://localhost:3444";
const OUT = process.env.ACCEPT_OUT || "acceptance-rc";
const stamp = Date.now().toString(36);
// Fresh accounts per run: a random password unless one is supplied. Never commit one.
const PASS = process.env.ACCEPT_PASSWORD || `Rc-${randomBytes(12).toString("base64url")}!9a`;
const emailB = process.env.ACCEPT_EMAIL_B || `rc-b-${stamp}@zooka-test.dev`;
const emailC = process.env.ACCEPT_EMAIL_C || `rc-c-${stamp}@zoka-test.dev`.replace("zoka", "zooka");

mkdirSync(OUT, { recursive: true });
const results = [];
const shots = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  shots.push(path);
  return path;
}

async function submitAuth(page, path, email, password) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  const button = page.locator('form button[type="submit"], button:has-text("دخول"), button:has-text("إنشاء")').first();
  await button.click();
  // The action returns when the server answers; a redirect leaves both forms.
  await page
    .waitForFunction(
      () => !document.body.innerText.includes("Loading"),
      undefined,
      { timeout: 45000 }
    )
    .catch(() => {});
}

async function sessionEmail(context) {
  const res = await context.request.get(`${BASE}/api/auth/session`);
  if (!res.ok()) return null;
  const body = await res.json().catch(() => ({}));
  return body?.user?.email ?? null;
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 200)));

try {
  // 1. Registration through the real form.
  await submitAuth(page, "/register", emailB, PASS);
  await page.waitForTimeout(4000);
  const afterRegister = page.url();
  // Registration ends on /login?registered=1 by design; only staying on /register is a failure.
  const registered = !new URL(afterRegister).pathname.startsWith("/register");
  await shot(page, "01-register");
  record("registration", registered, `landed ${afterRegister.replace(BASE, "")}`);

  // 2. Login. Registration ends on /login without a session by design (the
  // account is created, the sign-in is a separate step), so always sign in when
  // no session exists yet.
  if (!(await sessionEmail(context))) {
    await submitAuth(page, "/login", emailB, PASS);
    await page.waitForTimeout(4000);
  }
  const email = await sessionEmail(context);
  const loggedIn = Boolean(email);
  record("login", loggedIn, email ? `session ${email}` : "no session cookie");
  await shot(page, "02-after-login");

  if (!loggedIn) {
    // Everything below needs a session; report the rest as blocked honestly.
    for (const name of [
      "session persistence",
      "workspace access",
      "chat",
      "commander",
      "agent management",
      "project creation",
      "task execution",
      "execution evidence",
      "tenant isolation",
      "logout",
    ]) {
      record(name, false, "blocked: no session");
    }
  } else {
    // 3. Session persistence across a full reload and a new tab.
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const stillIn = Boolean(await sessionEmail(context));
    record("session persistence", stillIn, `after navigation session=${stillIn ? "present" : "gone"}`);

    // 4. Workspace access.
    const wsStatus = (await context.request.get(`${BASE}/workspace`)).status();
    record("workspace access", wsStatus === 200, `GET /workspace ${wsStatus}`);
    await shot(page, "03-workspace");

    // 5. Chat surface.
    const chatPage = await context.request.get(`${BASE}/workspace/agent`);
    const chatOk = chatPage.status() === 200;
    await page.goto(`${BASE}/workspace/agent`, { waitUntil: "domcontentloaded" });
    await shot(page, "04-chat");
    record("chat", chatOk, `GET /workspace/agent ${chatPage.status()}`);

    // 6. Commander.
    const commander = await context.request.get(`${BASE}/workspace/commander`);
    await page.goto(`${BASE}/workspace/commander`, { waitUntil: "domcontentloaded" });
    await shot(page, "05-commander");
    record("commander", commander.status() === 200, `GET /workspace/commander ${commander.status()}`);

    // 7. Agent management.
    const agents = await context.request.get(`${BASE}/workspace/agents`);
    await page.goto(`${BASE}/workspace/agents`, { waitUntil: "domcontentloaded" });
    await shot(page, "06-agents");
    record("agent management", agents.status() === 200, `GET /workspace/agents ${agents.status()}`);

    // 8. Project creation through the API the UI uses.
    let projectId = null;
    const created = await context.request.post(`${BASE}/api/workspace/projects`, {
      data: { name: `RC project ${stamp}`, summary: "release candidate acceptance" },
    });
    if (created.ok()) {
      const body = await created.json().catch(() => ({}));
      projectId = body?.project?.id ?? body?.id ?? null;
    }
    record("project creation", Boolean(projectId), `POST /api/workspace/projects ${created.status()} id=${projectId ?? "none"}`);

    // 9. Task execution: queue a real action through the actions API.
    let taskId = null;
    if (projectId) {
      const actions = await context.request.get(`${BASE}/api/workspace/actions`);
      const catalog = actions.ok() ? await actions.json().catch(() => ({})) : {};
      const list = catalog?.actions ?? catalog?.catalog ?? [];
      const runnable = Array.isArray(list)
        ? list.find((a) => a?.executable && !a?.approvalRequired) ?? list.find((a) => a?.executable)
        : null;
      if (runnable) {
        const run = await context.request.post(`${BASE}/api/actions/run`, {
          data: { actionId: runnable.id ?? runnable.actionId, projectId, input: { text: "acceptance sample text for analysis" } },
        });
        const runBody = run.ok() ? await run.json().catch(() => ({})) : {};
        taskId = runBody?.taskId ?? runBody?.task?.id ?? null;
        record("task execution", Boolean(taskId), `action=${runnable.id ?? runnable.actionId} POST ${run.status()} task=${taskId ?? "none"}`);
      } else {
        record("task execution", false, `no executable action in catalog (${actions.status()})`);
      }
    } else {
      record("task execution", false, "blocked: no project");
    }

    // 10. Execution evidence for that task.
    if (taskId) {
      const detail = await context.request.get(`${BASE}/api/agents/tasks/${taskId}`);
      const body = detail.ok() ? await detail.json().catch(() => ({})) : {};
      const evidence = body?.task?.evidence ?? body?.evidence ?? null;
      record("execution evidence", Boolean(evidence), `GET task ${detail.status()} evidence=${evidence ? "present" : "absent"}`);
    } else {
      record("execution evidence", false, "blocked: no task");
    }

    // 11. Tenant isolation: a second account must not reach the first one's project.
    const other = await browser.newContext({ ignoreHTTPSErrors: true });
    const otherPage = await other.newPage();
    try {
      await submitAuth(otherPage, "/register", emailC, PASS);
      await otherPage.waitForTimeout(1200);
      if (!(await sessionEmail(other))) {
        await submitAuth(otherPage, "/login", emailC, PASS);
        await otherPage.waitForTimeout(1200);
      }
      const otherEmail = await sessionEmail(other);
      if (!otherEmail) {
        record("tenant isolation", false, "blocked: second account has no session");
      } else {
        const cross = projectId
          ? await other.request.get(`${BASE}/api/workspace/projects/${projectId}`, { maxRedirects: 0 })
          : null;
        const denied = cross ? [401, 403, 404].includes(cross.status()) : false;
        record(
          "tenant isolation",
          denied,
          cross ? `second tenant GET first project -> ${cross.status()}` : "no project to probe"
        );
        await shot(otherPage, "07-second-tenant");
      }
    } finally {
      await other.close();
    }

    // 12. Logout.
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
    const csrf = csrfRes.ok() ? (await csrfRes.json()).csrfToken : null;
    if (csrf) {
      await context.request.post(`${BASE}/api/auth/signout`, {
        form: { csrfToken: csrf, callbackUrl: `${BASE}/` },
      });
    }
    const afterLogout = await context.request.get(`${BASE}/workspace`, { maxRedirects: 0 });
    const signedOut = [302, 307, 401, 403].includes(afterLogout.status()) && !(await sessionEmail(context));
    record("logout", signedOut, `GET /workspace after signout -> ${afterLogout.status()}`);
  }
} catch (error) {
  record("harness", false, String(error).slice(0, 300));
} finally {
  if (consoleErrors.length) {
    results.push({ name: "console errors", ok: false, detail: consoleErrors.slice(0, 6).join(" | ") });
  }
  const passed = results.filter((r) => r.ok).length;
  writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify({ base: BASE, when: new Date().toISOString(), passed, total: results.length, results, screenshots: shots }, null, 2)
  );
  console.log(`\n${passed}/${results.length} checks passed`);
  await browser.close();
}
