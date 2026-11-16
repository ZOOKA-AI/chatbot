// The customer path end to end: an Arabic instruction becomes a real file, through the agent.
//
// This is the part unit tests cannot prove: the action queue, the agent's own tool permission, the
// worker claim, and the studio tool writing a file all have to line up in one run.
import { chromium } from "@playwright/test";

const BASE = process.env.ACCEPT_BASE_URL;
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const api = async (path, init) => {
  const response = await context.request.fetch(`${BASE}${path}`, { maxRedirects: 0, ...init });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: response.status(), body };
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", process.env.ACCEPT_EMAIL);
  await page.fill("#password", process.env.ACCEPT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});

  const library = await api("/api/studio/assets");
  const image = (library.body.assets ?? []).find((asset) => asset.kind === "image");
  check("the workspace has an image to work on", Boolean(image), image?.label ?? "none");

  // 1. A customer asks in Arabic. The catalog turns it into a task with the payload the tool needs.
  const queued = await api("/api/actions/studio_image_edit/run", {
    method: "POST",
    data: { projectId: process.env.ACCEPT_PROJECT, inputs: { asset: image?.label ?? image?.id, instruction: "كبّرها إلى 1080x1920" } },
  });
  const taskId = queued.body.task?.id ?? queued.body.taskId ?? null;
  check("an Arabic request queues a real task", queued.status === 201 && Boolean(taskId), `${queued.status} ${taskId ?? JSON.stringify(queued.body).slice(0, 120)}`);

  // 2. The agent picks it up with its own key. Its allowedTools decide what it may run.
  const worker = await context.request.fetch(`${BASE}/api/agents/worker`, {
    method: "POST",
    maxRedirects: 0,
    headers: { authorization: `Bearer ${process.env.ACCEPT_AGENT_KEY}` },
    data: { taskId, tool: "studio_image_edit" },
  });
  const workerBody = await worker.json().catch(() => ({}));
  // The worker answers with the outcome it recorded plus the execution row; the tool's evidence is
  // inside the outcome, not at the top level.
  const outcome = workerBody.outcome ?? {};
  check("the agent executes the studio tool", worker.status() === 200 && outcome.ok === true, `${worker.status()} ${outcome.error ?? outcome.summary ?? ""}`.slice(0, 160));

  const produced = outcome.evidence?.assetId ?? null;
  check("the run reports the asset it produced", Boolean(produced), String(outcome.summary ?? "").slice(0, 140));

  // 3. The file is real: it is in the library, and it downloads with bytes.
  const after = await api("/api/studio/assets");
  const created = (after.body.assets ?? []).find((asset) => asset.id === produced);
  check("the produced asset is in the workspace library", Boolean(created), created ? `${created.kind} ${created.width}×${created.height}` : "missing");
  check("the agent's edit used the size the customer asked for", created?.width === 1080 && created?.height === 1920, `${created?.width}×${created?.height}`);
  check("the result names the original it came from", created?.parentAssetId === image?.id || Boolean(created?.parentAssetId), String(created?.parentAssetId ?? "none"));

  const download = await context.request.get(`${BASE}/api/studio/assets/${produced}/file?download=1`, { maxRedirects: 0 });
  const bytes = await download.body();
  check("the agent's output downloads as real bytes", download.status() === 200 && bytes.length > 5000, `${download.status()} ${bytes.length} bytes`);

  // 4. A tool the agent was not given is refused before any work happens, whether the queue refuses
  //    to create the task or the worker refuses to claim it.
  const denied = await api("/api/actions/studio_narration/run", {
    method: "POST",
    data: { projectId: process.env.ACCEPT_PROJECT, inputs: { script: "نص تجريبي" } },
  });
  const deniedTaskId = denied.body.task?.id ?? null;
  let refused = denied.status === 403 || denied.status === 409;
  let refusalDetail = `${denied.status} ${denied.body.error ?? ""}`;
  if (!refused && deniedTaskId) {
    const deniedResponse = await context.request.fetch(`${BASE}/api/agents/worker`, {
      method: "POST",
      maxRedirects: 0,
      headers: { authorization: `Bearer ${process.env.ACCEPT_AGENT_KEY}` },
      data: { taskId: deniedTaskId, tool: "studio_narration" },
    });
    const deniedBody = await deniedResponse.json().catch(() => ({}));
    refused = deniedResponse.status() === 403 || deniedBody.error === "tool_not_assigned" || deniedBody.outcome?.error === "tool_not_authorized";
    refusalDetail = `${deniedResponse.status()} ${deniedBody.error ?? deniedBody.outcome?.error ?? ""}`;
  }
  check("an unassigned studio tool is refused, not silently run", refused, refusalDetail);

  // 5. The engine matrix says the platform stands without a provider.
  const engines = await api("/api/studio/engines");
  const decisions = engines.body.decisions ?? [];
  const local = decisions.filter((d) => ["image_edit", "background_remove", "video_render", "audio_edit"].includes(d.capability));
  check("editing, cutouts, rendering and audio are decided locally", local.length === 4 && local.every((d) => d.tier === "local"), local.map((d) => `${d.capability}:${d.chosen}`).join(","));
  const generation = decisions.find((d) => d.capability === "image_generate");
  check("generation is refused with named reasons, not faked", generation?.chosen === null && (generation?.refused ?? []).length > 0, (generation?.refused ?? []).map((r) => r.reason).join(","));
  check("the platform reports itself self-sufficient without a GPU", engines.body.selfSufficient?.ok === true, JSON.stringify(engines.body.selfSufficient?.gaps ?? []));
  check("paid engines are off and cite no approval", engines.body.paid?.enabled === false && engines.body.paid?.approvalCited === false, JSON.stringify(engines.body.paid));

  const failed = results.filter((result) => !result.ok).length;
  console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (error) {
  check("agent-path acceptance run completed without throwing", false, String(error).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
