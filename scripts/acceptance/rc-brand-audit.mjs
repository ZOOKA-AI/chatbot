/**
 * Brand and layout acceptance over the real application routes.
 *
 * Each page is loaded twice: desktop (1440) and mobile (390). For each load we record
 * the status, the document direction, whether the layout overflows horizontally, the
 * landmark and accessible-name coverage, console errors, and whether the page shows a
 * real data state or a failure state. Nothing here is a screenshot of a design mock:
 * these are the live routes on the preview build.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.ACCEPT_BASE || "https://localhost:3444";
const OUT = process.env.ACCEPT_OUT || "acceptance-rc/brand";
const EMAIL = process.env.ACCEPT_EMAIL || "rc-b-mwjc8sws@zooka-test.dev";
// The password of an existing test account comes from the environment only.
const PASS = process.env.ACCEPT_PASSWORD;
if (!PASS) {
  console.error("ACCEPT_PASSWORD is required (never commit a password)");
  process.exit(2);
}
/**
 * Vercel Deployment Protection: a host that protects its previews answers 302 to
 * vercel.com/sso-api for any scripted client. When the owner has stored a Protection
 * Bypass for Automation in the agent secrets, it is presented as a header (and the
 * response sets the bypass cookie for the cookie jar). The value is never printed.
 */
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS || "";
const BYPASS_HEADERS = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["landing", "/", "ltr"],
  ["landing-ar", "/ar", "rtl"],
  ["login", "/login", "ltr"],
  ["register", "/register", "ltr"],
  ["pricing", "/pricing", "ltr"],
  ["about", "/about", "ltr"],
  ["contact", "/contact", "ltr"],
  ["blog", "/blog", "ltr"],
  ["cookies", "/cookies", "ltr"],
  ["explore", "/explore", "ltr"],
  ["privacy", "/privacy", "ltr"],
  ["developer", "/developer", "ltr"],
  ["workspace", "/workspace", "ltr"],
  ["workspace-agent", "/workspace/agent", "ltr"],
  ["workspace-agents", "/workspace/agents", "ltr"],
  ["workspace-commander", "/workspace/commander", "ltr"],
  ["workspace-projects", "/workspace/projects", "ltr"],
  ["workspace-actions", "/workspace/actions", "ltr"],
  ["workspace-documents", "/workspace/documents", "ltr"],
  ["workspace-schedules", "/workspace/schedules", "ltr"],
  ["workspace-launch", "/workspace/launch", "ltr"],
  ["workspace-studio", "/workspace/studio", "ltr"],
  ["workspace-browser", "/workspace/browser", "ltr"],
  ["workspace-billing", "/workspace/billing", "ltr"],
  ["workspace-usage", "/workspace/usage", "ltr"],
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: BYPASS_HEADERS,
});
if (BYPASS) ctx.setExtraHTTPHeaders(BYPASS_HEADERS);
console.log(`base=${BASE} bypass=${BYPASS ? "present" : "absent"}`);
const csrf = (await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json()).csrfToken;
await ctx.request.post(`${BASE}/api/auth/callback/credentials`, {
  form: { csrfToken: csrf, email: EMAIL, password: PASS, callbackUrl: `${BASE}/` },
});
const session = await (await ctx.request.get(`${BASE}/api/auth/session`)).json();

const results = [];
for (const [name, path, dir] of PAGES) {
 for (const lang of ["ar", "en"]) {
  const expectedDir = lang === "ar" ? "rtl" : "ltr";
  await ctx.addCookies([{ name: "zooka_lang", value: lang, url: BASE, httpOnly: false, secure: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 160)));

  const row = { name, path, expectedDir };
  for (const mode of ["desktop", "mobile"]) {
    await page.setViewportSize(mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 });
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(700);
    const probe = await page.evaluate(() => {
      const html = document.documentElement;
      const text = (document.body?.innerText || "").slice(0, 4000);
      const clickable = [...document.querySelectorAll("a,button")].filter((el) => el.offsetParent !== null);
      const unlabeled = clickable.filter((el) => {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
        return label.length === 0;
      }).length;
      const inputs = [...document.querySelectorAll("input,select,textarea")].filter((el) => el.offsetParent !== null);
      const unlabelledInputs = inputs.filter((el) => {
        const id = el.getAttribute("id");
        const labelled = el.getAttribute("aria-label") || el.getAttribute("placeholder") ||
          (id && document.querySelector(`label[for="${id}"]`));
        return !labelled;
      }).length;
      const images = [...document.querySelectorAll("img")];
      return {
        dir: html.getAttribute("dir") || "",
        lang: html.getAttribute("lang") || "",
        overflow: Math.max(0, html.scrollWidth - window.innerWidth),
        landmarks: document.querySelectorAll("header,nav,main,footer").length,
        h1: document.querySelectorAll("h1").length,
        unlabeled,
        unlabelledInputs,
        imagesWithoutAlt: images.filter((img) => !img.getAttribute("alt")).length,
        text,
        title: document.title,
      };
    });
    row[mode] = {
      status: response?.status() ?? 0,
      ...probe,
      text: undefined,
      consoleErrors: [...new Set(consoleErrors)].slice(0, 3),
      errorState: /something went wrong|application error|could not load|حدث خطأ/i.test(probe.text),
      hasContent: probe.text.trim().length > 120,
    };
    // Screenshots: both viewports in Arabic, desktop in English, plus mobile on the
    // pages where RTL/LTR mirrors an actual layout (landing, chat, commander, projects).
    const wantsShot =
      lang === "ar" ||
      mode === "desktop" ||
      ["landing", "workspace", "workspace-commander", "workspace-projects"].includes(name);
    if (wantsShot) await page.screenshot({ path: `${OUT}/${name}-${lang}-${mode}.png`, fullPage: false });
  }

  const d = row.desktop;
  const m = row.mobile;
  row.lang = lang;
  row.pass =
    d.status === 200 && m.status === 200 &&
    d.dir === expectedDir &&
    m.overflow <= 2 &&
    d.landmarks >= 2 &&
    d.unlabeled === 0 &&
    d.unlabelledInputs === 0 &&
    d.imagesWithoutAlt === 0 &&
    !d.errorState && !m.errorState &&
    d.hasContent &&
    d.consoleErrors.length === 0;
  row.notes = [
    d.status !== 200 ? `desktop ${d.status}` : null,
    m.status !== 200 ? `mobile ${m.status}` : null,
    d.dir !== expectedDir ? `dir=${d.dir || "none"}` : null,
    m.overflow > 2 ? `mobile overflow ${m.overflow}px` : null,
    d.unlabeled ? `${d.unlabeled} unlabeled controls` : null,
    d.unlabelledInputs ? `${d.unlabelledInputs} unlabeled inputs` : null,
    d.imagesWithoutAlt ? `${d.imagesWithoutAlt} images without alt` : null,
    d.errorState || m.errorState ? "error state rendered" : null,
    !d.hasContent ? "empty page" : null,
    d.consoleErrors.length ? `console: ${d.consoleErrors[0]}` : null,
  ].filter(Boolean).join("; ");
  results.push(row);
  console.log(`${row.pass ? "PASS" : "FAIL"}  ${lang}  ${name.padEnd(20)} ${path.padEnd(24)} ${row.notes}`);
  await page.close();
 }
}

const passed = results.filter((r) => r.pass).length;
const summary = {
  base: BASE,
  when: new Date().toISOString(),
  session: session?.user?.email ?? null,
  pages: results.length,
  passed,
  failed: results.length - passed,
  results,
};
writeFileSync(`${OUT}/brand-audit.json`, JSON.stringify(summary, null, 2));
console.log(`\n${passed}/${results.length} pages passed`);
await browser.close();
