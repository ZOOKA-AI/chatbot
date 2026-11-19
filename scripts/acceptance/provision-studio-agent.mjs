/**
 * Prepares the two things the studio customer-path acceptance needs and cannot invent:
 * a project to own the work, and an agent key that holds exactly the studio tools.
 * Prints them as JSON on stdout. Read-only with respect to product code.
 */
import { chromium } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.ACCEPT_BASE_URL ?? "https://localhost:3543";
const sql = postgres(process.env.ACCEPT_PG ?? "postgres://postgres@127.0.0.1:55432/zooka_ui");

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#email", process.env.ACCEPT_EMAIL);
await page.fill("#password", process.env.ACCEPT_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});

const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
const orgId = session?.user?.organizationId ?? null;
if (!orgId) { console.error(JSON.stringify({ error: "no_session" })); process.exit(2); }

const agentKey = `zk_${randomBytes(24).toString("hex")}`;
const keyHash = createHash("sha256").update(agentKey).digest("hex");
await sql`
  insert into "AgentIdentity" ("organizationId","slug","displayName","role","keyHash","allowedTools","status")
  values (${orgId}, ${`studio-proof-${Date.now().toString().slice(-6)}`}, 'Studio proof', 'researcher',
          ${keyHash}, ${JSON.stringify(["studio_image_edit", "studio_background_remove"])}::jsonb, 'active')`;

const created = await context.request.post(`${BASE}/api/workspace/projects`, {
  data: { name: `Studio proof ${Date.now().toString().slice(-6)}`, summary: "Studio customer path" },
});
const body = await created.json().catch(() => ({}));
const projectId = body?.project?.id ?? null;

// The agent must be attached to the project it will work in, or the queue refuses for the right reason.
if (projectId) {
  const [agent] = await sql`select id from "AgentIdentity" where "keyHash" = ${keyHash} limit 1`;
  if (agent?.id) await context.request.post(`${BASE}/api/workspace/projects/${projectId}/agents`, { data: { agentId: agent.id } });
}

await browser.close();
await sql.end();
console.log(JSON.stringify({ projectId, agentKey, orgId }));
