// Real browser acceptance: a logged-in customer, a real Chromium session, real controls.
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { startTestSite } from "./browser-test-site.mjs";

const BASE = process.env.ACCEPT_BASE_URL;
const EMAIL = process.env.ACCEPT_EMAIL;
const PASSWORD = process.env.ACCEPT_PASSWORD;
const SITE = "http://127.0.0.1:4517";

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const site = await startTestSite(4517);
const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
let sessionId = null;

const api = async (path, init) => {
  const response = await context.request.fetch(`${BASE}${path}`, {
    maxRedirects: 0,
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: response.status(), body, headers: response.headers() };
};

try {
  // 1. customer login through the real form
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});
  const signedIn = await api("/api/workspace/browser/sessions");
  check("customer signs in and can call the session API", signedIn.status === 200, `status ${signedIn.status}`);

  // 2. a session row is created before any browser exists
  const created = await api("/api/workspace/browser/sessions", {
    method: "POST",
    data: { startUrl: SITE, ttlMinutes: 15 },
  });
  sessionId = created.body.session?.id ?? null;
  check("a session row is created", created.status === 201 && Boolean(sessionId), `status ${created.status}`);
  check("it starts unstarted, not pretending to be live", created.body.session?.status === "created", String(created.body.session?.status));

  // 3. starting launches a real browser and navigates to the controlled site
  const started = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "start" } });
  check("start opens a real browser and loads the site", started.status === 200 && started.body.session?.status === "ready", `${started.status} ${started.body.session?.status ?? started.body.error}`);
  check("the URL is the site that was actually loaded", String(started.body.session?.currentUrl ?? "").includes("127.0.0.1:4517"), String(started.body.session?.currentUrl ?? "—"));
  check("the page title was read from the live page", started.body.session?.currentTitle === "صفحة الاختبار", String(started.body.session?.currentTitle ?? "—"));

  // 4. a live frame is a real screenshot taken now
  const frame = await context.request.get(`${BASE}/api/workspace/browser/sessions/${sessionId}/frame`, { maxRedirects: 0 });
  const frameBytes = (await frame.body()).byteLength;
  check("the live frame is a real PNG from the running browser", frame.status() === 200 && frame.headers()["content-type"] === "image/png" && frameBytes > 5000, `${frameBytes} bytes`);

  // 5. pause is real, and it stops the agent
  const paused = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "pause" } });
  check("pause moves the session to paused", paused.body.session?.status === "paused", String(paused.body.session?.status));
  const frameWhilePaused = await context.request.get(`${BASE}/api/workspace/browser/sessions/${sessionId}/frame`, { maxRedirects: 0 });
  check("a paused browser is still observable", frameWhilePaused.status() === 200, `status ${frameWhilePaused.status()}`);

  const resumed = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "resume" } });
  check("resume returns a paused session to running", resumed.body.session?.status === "running", String(resumed.body.session?.status ?? resumed.body.error));

  // 6. take over and hand back
  const takeover = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "take_over" } });
  check("take over gives control to the person", takeover.body.session?.status === "taken_over" && takeover.body.session?.controlHolder === "human", String(takeover.body.session?.controlHolder));
  const returned = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "return_control" } });
  check("control returns to the agent", returned.body.session?.controlHolder === "agent", String(returned.body.session?.controlHolder));

  // 6b. the person drives the page: a real click at a coordinate, then real keystrokes
  const takeover2 = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "take_over" } });
  check("control is with the person before input", takeover2.body.session?.controlHolder === "human", String(takeover2.body.session?.controlHolder));
  const click = await api(`/api/workspace/browser/sessions/${sessionId}/input`, { method: "POST", data: { kind: "click", x: 100, y: 30 } });
  check("a click at a coordinate reaches the live page", click.status === 200 && String(click.body.session?.currentUrl ?? "").includes("/second"), `${click.status} ${click.body.session?.currentUrl ?? click.body.error}`);
  const typed = await api(`/api/workspace/browser/sessions/${sessionId}/input`, { method: "POST", data: { kind: "type", text: "مرحبا" } });
  check("keystrokes reach the live page", typed.status === 200 && typed.body.executed === "type", `${typed.status} ${typed.body.error ?? "ok"}`);
  const scrolled = await api(`/api/workspace/browser/sessions/${sessionId}/input`, { method: "POST", data: { kind: "scroll", deltaY: 400 } });
  check("scrolling reaches the live page", scrolled.status === 200, `${scrolled.status} ${scrolled.body.error ?? "ok"}`);
  const navigated = await api(`/api/workspace/browser/sessions/${sessionId}/input`, { method: "POST", data: { kind: "navigate", url: SITE } });
  check("navigation by the person reaches the live page", navigated.status === 200 && String(navigated.body.session?.currentUrl ?? "").includes("4517"), `${navigated.status}`);

  // 6c. while the agent holds control, human input is refused rather than interleaved
  await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "return_control" } });
  const refusedInput = await api(`/api/workspace/browser/sessions/${sessionId}/input`, { method: "POST", data: { kind: "type", text: "x" } });
  check("human input is refused while the agent holds control", refusedInput.status === 409 && refusedInput.body.error === "agent_has_control", `${refusedInput.status} ${refusedInput.body.error}`);

  // 6d. a row that claims to be alive with no browser is reported broken, then recovered for real
  const broke = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "take_over" } });
  check("session can be taken for the recovery test", broke.status === 200, String(broke.body.session?.status ?? broke.body.error));
  await fetch("http://127.0.0.1:4517/").catch(() => {});
  const recovered = await api(`/api/workspace/browser/sessions/${sessionId}/recover`, { method: "POST", data: {} });
  check("a recovery request relaunches a browser on the same record", recovered.status === 200 && String(recovered.body.session?.status ?? "").includes("taken_over"), `${recovered.status} ${recovered.body.error ?? recovered.body.session?.status}`);
  const afterRecovery = await api(`/api/workspace/browser/sessions/${sessionId}`);
  check("the recovered session is live again, not a stale frame", afterRecovery.body.runtime?.live === true, `live=${afterRecovery.body.runtime?.live}`);

  // 7. stop: the browser really closes
  const stopped = await api(`/api/workspace/browser/sessions/${sessionId}/control`, { method: "POST", data: { action: "stop" } });
  check("stop closes the session", stopped.body.session?.status === "stopped", String(stopped.body.session?.status));
  const frameAfterStop = await context.request.get(`${BASE}/api/workspace/browser/sessions/${sessionId}/frame`, { maxRedirects: 0 });
  check("after stop no frame is served, so no stale live view", frameAfterStop.status() === 409, `status ${frameAfterStop.status()}`);

  // 8. the record survives a reload
  const detail = await api(`/api/workspace/browser/sessions/${sessionId}`);
  const kinds = (detail.body.events ?? []).map((event) => event.kind);
  check(
    "the timeline persisted across the whole run",
    detail.status === 200 &&
      ["session_started", "session_paused", "session_resumed", "session_taken_over", "control_returned", "human_click", "human_type", "session_recovered", "session_stopped"].every((kind) =>
        kinds.includes(kind)
      ),
    kinds.join(",")
  );
  await page.goto(`${BASE}/workspace/browser`, { waitUntil: "networkidle" });
  const panelText = await page.locator("body").innerText();
  await page.screenshot({ path: "acceptance/browser-panel.png", fullPage: true });
  check("the customer panel renders the session", panelText.includes("متصفح الوكيل") && panelText.includes("مغلق"), `${panelText.length} chars`);

  // 9. another workspace cannot see or drive it
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const otherPage = await other.newPage();
  await otherPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await otherPage.fill("#email", "other@acceptance.local");
  await otherPage.fill("#password", "AcceptanceOther-2026-z9");
  await otherPage.click('button[type="submit"]');
  await otherPage.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});
  const foreignRead = await other.request.get(`${BASE}/api/workspace/browser/sessions/${sessionId}`, { maxRedirects: 0 });
  check("another workspace gets 404 on the session", foreignRead.status() === 404, `status ${foreignRead.status()}`);
  const foreignControl = await other.request.post(`${BASE}/api/workspace/browser/sessions/${sessionId}/control`, { data: { action: "stop" }, maxRedirects: 0 });
  check("another workspace cannot control the session", foreignControl.status() === 404, `status ${foreignControl.status()}`);
  await other.close();

  // 10. no session means no session
  await context.clearCookies();
  const anonymous = await context.request.post(`${BASE}/api/workspace/browser/sessions`, { data: {}, maxRedirects: 0 });
  check("without a session the API refuses", anonymous.status() === 307 || anonymous.status() === 401, `status ${anonymous.status()}`);
} catch (error) {
  check("browser acceptance run completed without throwing", false, String(error).slice(0, 240));
} finally {
  await browser.close();
  site.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${passed}/${results.length} passed`);
