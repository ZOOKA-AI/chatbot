/**
 * Task execution lifecycle against the real runtime.
 *
 * Exercises the customer path end to end: register an agent, allow it exactly one
 * worker tool, queue a catalog action into a real project, let the worker claim and
 * run it, then read the persisted task back. Every response code is recorded; a
 * refusal is reported as a refusal, never as a pass.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.ACCEPT_BASE || "https://localhost:3444";
const OUT = process.env.ACCEPT_OUT || "acceptance-rc";
const EMAIL = process.env.ACCEPT_EMAIL || "rc-b-mwjc8sws@zooka-test.dev";
// The password of an existing test account comes from the environment only.
const PASS = process.env.ACCEPT_PASSWORD;
if (!PASS) {
  console.error("ACCEPT_PASSWORD is required (never commit a password)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, detail) => {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const req = ctx.request;

// Session through the same callback the browser client uses.
const csrf = (await (await req.get(`${BASE}/api/auth/csrf`)).json()).csrfToken;
const signIn = await req.post(`${BASE}/api/auth/callback/credentials`, {
  form: { csrfToken: csrf, email: EMAIL, password: PASS, callbackUrl: `${BASE}/` },
});
const session = await (await req.get(`${BASE}/api/auth/session`)).json();
rec("session established", Boolean(session?.user?.email), `${signIn.status()} ${session?.user?.email ?? "none"}`);
if (!session?.user?.email) {
  writeFileSync(`${OUT}/lifecycle.json`, JSON.stringify({ steps }, null, 2));
  await browser.close();
  process.exit(0);
}

// 1. Catalog: what this workspace may actually run.
const catalog = await (await req.get(`${BASE}/api/actions`)).json();
const actions = catalog.actions ?? [];
rec("action catalog", actions.length > 0, `${catalog.catalogVersion} actions=${actions.length} executable=${actions.filter((a) => a.executable).length}`);

// project_document is the strongest evidence path: it writes a real, readable
// document into the project and needs no paid provider.
const runnable = actions.find((a) => a.id === "project_document") ?? actions.find((a) => a.executable);
if (!runnable) {
  rec("task creation", false, "no executable action in catalog");
  writeFileSync(`${OUT}/lifecycle.json`, JSON.stringify({ steps }, null, 2));
  await browser.close();
  process.exit(0);
}

// 2. Registry: which tools exist, and an agent allowed to use exactly the one we need.
const registry = await (await req.get(`${BASE}/api/agents/registry`)).json();
const tools = registry.tools ?? [];
// The catalog does not name the worker tool, so resolve it against the real
// tool list the registry reports.
const needed =
  (runnable.tools?.[0]?.id ?? runnable.tools?.[0]) ??
  tools.map((t) => t.id).find((id) => id.startsWith(runnable.id)) ??
  tools.map((t) => t.id).find((id) => id.includes(runnable.id.split("_")[0])) ??
  null;
rec("tool catalog", tools.length > 0, `tools=${tools.map((t) => t.id).join(",").slice(0, 90)}`);

const slug = `rc-agent-${Date.now().toString(36)}`;
const createdAgent = await req.post(`${BASE}/api/agents/registry`, {
  data: { slug, displayName: `RC agent ${slug}`, role: "executor", environment: "preview" },
});
const agentBody = createdAgent.ok() ? await createdAgent.json() : {};
const agentId = agentBody.agent?.id ?? agentBody.id ?? null;
const agentKey = agentBody.key ?? agentBody.apiKey ?? null;
rec("agent registration", Boolean(agentId && agentKey), `${createdAgent.status()} agent=${agentId ?? "none"} key=${agentKey ? "issued" : "missing"}`);

let allowed = false;
if (agentId && needed) {
  const patch = await req.patch(`${BASE}/api/agents/registry`, { data: { agentId, allowedTools: [needed] } });
  const patched = patch.ok() ? await patch.json() : {};
  const list = patched.agent?.allowedTools ?? patched.allowedTools ?? null;
  allowed = Array.isArray(list) && list.includes(needed);
  rec("agent tool assignment", allowed, `PATCH ${patch.status()} allowedTools=${JSON.stringify(list)}`);
}

// 3. Project + queued task.
const project = await req.post(`${BASE}/api/workspace/projects`, {
  data: { name: `RC lifecycle ${Date.now().toString(36)}`, summary: "release candidate lifecycle" },
});
const projectBody = project.ok() ? await project.json() : {};
const projectId = projectBody.project?.id ?? projectBody.id ?? null;
rec("project creation", Boolean(projectId), `POST ${project.status()} id=${projectId ?? "none"}`);

// Bind the agent to the project before queueing: the planner refuses an action whose
// tool no assigned agent holds.
if (projectId && agentId) {
  const assign = await req.post(`${BASE}/api/workspace/projects/${projectId}/agents`, { data: { agentId } });
  rec("agent assigned to project", assign.ok(), `POST ${assign.status()}`);
}

let taskId = null;
const runInputs =
  runnable.id === "project_document"
    ? { title: `RC document ${Date.now().toString(36)}`, brief: "ملخص جاهزية الإصدار للتحقق من مسار المستندات" }
    : { label: "release candidate acceptance" };

if (projectId) {
  const actionId = runnable.id ?? runnable.actionId;
  const run = await req.post(`${BASE}/api/actions/${actionId}/run`, {
    data: { projectId, inputs: runInputs },
  });
  const runBody = await run.json().catch(() => ({}));
  taskId = runBody.task?.id ?? runBody.taskId ?? null;
  rec("task creation", Boolean(taskId), `action=${actionId} POST ${run.status()} task=${taskId ?? "none"} ${run.ok() ? "" : JSON.stringify(runBody).slice(0, 120)}`);
}

// 3d. Duplicate protection, checked while the task is still queued: an identical
// request inside the window must return the same task instead of executing twice.
if (taskId) {
  const again = await req.post(`${BASE}/api/actions/project_document/run`, {
    data: { projectId, inputs: runInputs },
  });
  const againBody = await again.json().catch(() => ({}));
  const sameTask = (againBody.task?.id ?? againBody.taskId) === taskId;
  rec("no duplicate execution", sameTask || againBody.deduplicated === true, `POST ${again.status()} deduplicated=${againBody.deduplicated ?? "?"} sameTask=${sameTask}`);
}

// 4. Worker execution with the agent's own key.
let workerStatus = null;
if (taskId && agentKey) {
  const tool = needed;
  const claim = await req.post(`${BASE}/api/agents/worker`, {
    headers: { authorization: `Bearer ${agentKey}` },
    // No payload on purpose: the worker must fall back to the payload the planner
    // stored on the task, which carries the projectId the customer chose.
    data: { tool, taskId },
  });
  workerStatus = claim.status();
  const body = claim.ok() ? await claim.json() : await claim.json().catch(() => ({}));
  rec("worker execution", claim.ok(), `${workerStatus} ${JSON.stringify(body).slice(0, 200)}`);
}

// 5. Persisted evidence and history.
if (taskId) {
  const detail = await req.get(`${BASE}/api/agents/tasks/${taskId}`);
  const body = detail.ok() ? await detail.json() : {};
  const task = body.task ?? body;
  // The detail endpoint returns evidence beside the task, not inside it.
  const evidence = body.evidence ?? task?.evidence ?? null;
  rec("execution evidence persisted", Boolean(evidence), `GET ${detail.status()} status=${task?.status ?? "?"} evidence=${evidence ? String(evidence).slice(0, 80).replace(/\n/g, " ") : "absent"}`);
  rec("task details", detail.status() === 200, `GET /api/agents/tasks/{id} ${detail.status()}`);

  const history = await req.get(`${BASE}/api/agents/tasks?limit=10`);
  const hist = history.ok() ? await history.json() : {};
  const items = hist.tasks ?? hist.items ?? [];
  rec("task history", history.status() === 200 && items.some((t) => t.id === taskId), `GET /api/agents/tasks ${history.status()} count=${items.length}`);
} else {
  rec("execution evidence persisted", false, "blocked: no task");
  rec("task details", false, "blocked: no task");
  rec("task history", false, "blocked: no task");
}

// 5b. The written document must be readable by the customer, and an identical request
// must not execute twice.
if (projectId && taskId) {
  const docs = await req.get(`${BASE}/api/workspace/projects/${projectId}/documents`);
  const docBody = docs.ok() ? await docs.json() : {};
  const list = docBody.documents ?? docBody.items ?? [];
  const target = list.find((d) => d.taskId === taskId) ?? list[0];
  rec("document created", Boolean(target), `GET documents ${docs.status()} count=${list.length} title=${target?.title ?? "none"}`);
}

// 6. Cross-tenant probe from a second real workspace.
const other = await browser.newContext({ ignoreHTTPSErrors: true });
try {
  const c2 = (await (await other.request.get(`${BASE}/api/auth/csrf`)).json()).csrfToken;
  await other.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: { csrfToken: c2, email: process.env.ACCEPT_EMAIL_C, password: PASS, callbackUrl: `${BASE}/` },
  });
  const s2 = await (await other.request.get(`${BASE}/api/auth/session`)).json();
  if (!s2?.user?.email) {
    rec("tenant isolation", false, "blocked: second workspace has no session");
  } else {
    const probes = [
      ["project", projectId ? `${BASE}/api/workspace/projects/${projectId}` : null],
      ["task", taskId ? `${BASE}/api/agents/tasks/${taskId}` : null],
      ["project docs", projectId ? `${BASE}/api/workspace/projects/${projectId}/documents` : null],
    ];
    const results = [];
    for (const [label, url] of probes) {
      if (!url) continue;
      const res = await other.request.get(url, { maxRedirects: 0 });
      results.push(`${label}:${res.status()}`);
    }
    const denied = results.every((r) => /:(401|403|404)$/.test(r));
    rec("tenant isolation", denied, `second tenant -> ${results.join(" ")}`);
  }
} finally {
  await other.close();
}

const passed = steps.filter((s) => s.ok).length;
writeFileSync(`${OUT}/lifecycle.json`, JSON.stringify({ base: BASE, when: new Date().toISOString(), passed, total: steps.length, steps }, null, 2));
console.log(`\n${passed}/${steps.length} lifecycle checks passed`);
await browser.close();
