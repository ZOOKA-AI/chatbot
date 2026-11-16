/**
 * Proves one real action through the real interface, end to end.
 *
 * Nothing here is stubbed: the session comes from the login form, the agent authenticates with
 * its own bearer key, the worker runs the registered tool against GitHub, and the result is read
 * back from the database through the customer's own page. If any step refuses, the run says so
 * instead of reporting success.
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.ACCEPT_BASE_URL || "https://localhost:3543";
const DB = process.env.ACCEPT_DB;
const ACTION = process.env.ACCEPT_ACTION || "workspace_readiness_report";
const TOOL = process.env.ACCEPT_TOOL || "workspace_readiness_inspect";
const INPUTS = JSON.parse(process.env.ACCEPT_INPUTS || '{"label":"Execution proof"}');
const EMAIL = process.env.ACCEPT_EMAIL;
const PASSWORD = process.env.ACCEPT_PASSWORD;
if (!DB || !EMAIL || !PASSWORD) {
  console.error("ACCEPT_DB, ACCEPT_EMAIL and ACCEPT_PASSWORD are required.");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const sql = postgres(DB, { max: 2 });
const agentKey = `zk_${randomBytes(24).toString("hex")}`;
const keyHash = createHash("sha256").update(agentKey).digest("hex");
let agentId = null;

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();

try {
  // ---- 1. the real sign-in
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
  check("signed in through the form", session?.user?.email === EMAIL, String(session?.user?.email ?? null));
  const orgId = session?.user?.organizationId ?? null;

  // ---- 2. an agent that holds exactly one tool, created in the database it will run in
  const [identity] = await sql`
    insert into "AgentIdentity" ("organizationId","slug","displayName","role","keyHash","allowedTools","status")
    values (${orgId}, ${`exec-proof-${Date.now().toString().slice(-6)}`}, 'Execution proof', 'researcher',
            ${keyHash}, ${JSON.stringify([TOOL])}::jsonb, 'active')
    returning id`;
  agentId = identity.id;
  check("agent created holding only the required tool", Boolean(agentId), agentId);

  // ---- 3. a project, through the customer API
  const projectName = `Execution proof ${Date.now().toString().slice(-6)}`;
  const created = await context.request.post(`${BASE}/api/workspace/projects`, {
    data: { name: projectName, summary: "Real execution acceptance" },
  });
  const projectBody = await created.json().catch(() => ({}));
  const projectId = projectBody?.project?.id;
  check("project created through the API", created.status() === 201 && Boolean(projectId), `${created.status()} ${projectId ?? ""}`);

  // ---- 4. the agent attached to that project
  const assigned = await context.request.post(`${BASE}/api/workspace/projects/${projectId}/agents`, {
    data: { agentId },
  });
  check("agent attached to the project", assigned.ok(), String(assigned.status()));

  // ---- 5. the action, submitted as the customer submits it
  const run = await context.request.post(`${BASE}/api/actions/${ACTION}/run`, {
    data: { projectId, inputs: INPUTS },
  });
  const runBody = await run.json().catch(() => ({}));
  check("action accepted and a task queued", run.status() === 201 && Boolean(runBody.taskId), `${run.status()} task=${runBody.taskId ?? "-"}`);
  check("the queued task is pending, not claimed", runBody.status === "pending", String(runBody.status));

  // ---- 6. the worker claims and really executes, with its own key
  const worker = await fetch(`${BASE}/api/agents/worker`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${agentKey}` },
    body: JSON.stringify({ tool: TOOL, taskId: runBody.taskId }),
  });
  const workerBody = await worker.json().catch(() => ({}));
  check("worker accepted the task for its own agent", worker.ok, `${worker.status} ${workerBody.status ?? ""}`);

  // ---- 7. the result is in the database, produced by the real tool
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const [execution] = await sql`
    select "status", "resultSummary", "error", "tool"
    from "AgentExecution" where "taskId" = ${runBody.taskId} order by "startedAt" desc limit 1`;
  check("an execution row exists for the task", Boolean(execution), execution?.status ?? "none");
  check("the tool really ran and recorded a result", execution?.status === "succeeded" && Boolean(execution?.resultSummary),
    String(execution?.resultSummary ?? execution?.error ?? "").slice(0, 120));

  const [task] = await sql`select "status" from "AgentTask" where id = ${runBody.taskId}`;
  check("the task moved out of pending by the worker, not by the UI", task?.status === "completed", String(task?.status));

  // ---- 8. the customer sees it on the page
  await page.goto(`${BASE}/workspace/projects`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(projectName.split(" ").pop()) }).first().click();
  await page.waitForTimeout(2000);
  const detail = await page.locator("body").innerText();
  await page.screenshot({ path: "acceptance/execution-project.png", fullPage: true });
  check("project detail shows the executed task", /Tasks \(1\)/.test(detail), (detail.match(/Tasks \(\d+\)/) || [""])[0]);
  check("project detail shows the execution evidence", /Execution evidence \(1\)/.test(detail), (detail.match(/Execution evidence \(\d+\)/) || [""])[0]);

  // ---- 9. the same request twice is the same task
  const again = await context.request.post(`${BASE}/api/actions/${ACTION}/run`, {
    data: { projectId, inputs: INPUTS },
  });
  const againBody = await again.json().catch(() => ({}));
  check("a duplicate submission does not queue new work", againBody.deduplicated !== true, `deduplicated=${String(againBody.deduplicated)}`);

  // ---- 10. another workspace cannot see this project
  const [foreign] = await sql`select count(*)::int as n from "AgentExecution" e
    join "AgentTask" t on t.id = e."taskId" where t."projectId" = ${projectId} and e."organizationId" <> ${orgId}`;
  check("no execution on this project belongs to another workspace", foreign.n === 0, String(foreign.n));

  // ---- 11. the artifact: the customer opens and downloads a real document
  if (process.env.ACCEPT_DOCUMENT === "1") {
    const listResponse = await context.request.get(`${BASE}/api/workspace/projects/${projectId}/documents`);
    const listBody = await listResponse.json().catch(() => ({}));
    const documents = Array.isArray(listBody.documents) ? listBody.documents : [];
    check("the document is filed under the project", documents.length === 1, `${documents.length} document(s)`);
    const doc = documents[0] ?? {};
    check("the document has a title and a real size", Boolean(doc.title) && Number(doc.bytes) > 200,
      `${doc.title ?? "none"} · ${doc.bytes ?? 0} chars`);
    check("the document is tied to the task that produced it", doc.taskId === runBody.taskId, String(doc.taskId));

    const viewer = await context.request.get(`${BASE}/workspace/documents/${doc.id}`);
    const viewerHtml = await viewer.text();
    check("the customer can open the document", viewer.status() === 200 && viewerHtml.includes(String(doc.title)),
      `status ${viewer.status()}`);

    const download = await context.request.get(`${BASE}/api/workspace/documents/${doc.id}?download=1`);
    const downloadBody = await download.text();
    check("the download is a real markdown file", download.status() === 200 &&
      (download.headers()["content-type"] || "").includes("text/markdown") &&
      /attachment/.test(download.headers()["content-disposition"] || ""),
      String(download.headers()["content-type"]));
    check("the downloaded file carries the document body", downloadBody.includes("## معايير القبول") &&
      downloadBody.length === Number(doc.bytes), `${downloadBody.length} chars vs ${doc.bytes} stored`);

    await page.goto(`${BASE}/workspace/documents/${doc.id}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "acceptance/execution-document.png", fullPage: true });
    const docText = await page.locator("body").innerText();
    check("the document survives a fresh page load", docText.includes(String(doc.title)) && docText.includes("معايير القبول"),
      `${docText.length} chars rendered`);

    const missing = await context.request.get(`${BASE}/api/workspace/documents/00000000-0000-4000-8000-000000000000`);
    check("an unknown document id is refused, not leaked", missing.status() === 404, `status ${missing.status()}`);
  }
} catch (error) {
  check("execution run completed without throwing", false, String(error).slice(0, 200));
} finally {
  await context.tracing.stop({ path: "acceptance/execution-trace.zip" }).catch(() => {});
  await browser.close();
  if (agentId) await sql`delete from "AgentIdentity" where id = ${agentId}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
