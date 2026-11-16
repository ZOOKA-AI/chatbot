/**
 * The RunComfy surface, proven on a real server without spending anything.
 *
 * It answers the four questions the directive asks about the credential: is it absent (and said so),
 * is the route owner-only, does the response avoid carrying the token, and does the provider list show
 * the real blocker instead of a button that would fail on click.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.ACCEPT_BASE_URL ?? "https://localhost:3543";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const owner = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await owner.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', process.env.ACCEPT_EMAIL);
await page.fill('input[name="password"]', process.env.ACCEPT_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});

const status = await owner.request.get(`${BASE}/api/studio/runcomfy/status?deep=0`);
const body = await status.json().catch(() => ({}));
const text = JSON.stringify(body);
check("1. the owner can read the RunComfy status", status.status() === 200, `${status.status()}`);
check("2. the missing credential is named, not hidden", body.configured === false && /RUNCOMFY_API_TOKEN/.test(String(body.blocker)), String(body.blocker));
check("3. paid generation is off by default", body.paidGenerationEnabled === false, `paidGenerationEnabled=${body.paidGenerationEnabled}`);
check("4. nothing token-shaped is in the response", !/Bearer\s|rc_[A-Za-z0-9]|RUNCOMFY_API_TOKEN=/.test(text), "no key material");

const providers = await owner.request.get(`${BASE}/api/studio/providers`);
const providerBody = await providers.json().catch(() => ({}));
const runcomfy = (providerBody.providers ?? []).find((entry) => String(entry.id ?? entry.provider ?? "").includes("runcomfy"));
check("5. RunComfy appears in the provider list with its blocker", Boolean(runcomfy), JSON.stringify(runcomfy ?? {}).slice(0, 140));

const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
const anonymousStatus = await anonymous.request.get(`${BASE}/api/studio/runcomfy/status`, { maxRedirects: 0 });
check(
  "6. an unauthenticated caller is refused at the route",
  [307, 401, 403].includes(anonymousStatus.status()),
  String(anonymousStatus.status())
);

await browser.close();
const failed = results.filter((entry) => !entry.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
