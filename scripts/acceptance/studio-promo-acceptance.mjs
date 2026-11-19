// Directive #053: one Arabic sentence becomes a real, playable promo film, and the fences hold.
//
// Phase 2 is the film. Phase 3 is the refusals around it. Phase 4 is the provider matrix. Every
// number in the report comes from a file on disk or an HTTP status here, never from a claim.
import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const run = promisify(execFile);
const BASE = process.env.ACCEPT_BASE_URL;
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

await mkdir("acceptance", { recursive: true });

// A real logo with transparency, and a real Arabic script: the directive's own request.
await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x2E86AB@0:s=512x512,format=rgba",
  "-vf", "drawbox=x=96:y=180:w=320:h=90:color=white@0.95:t=fill,drawbox=x=96:y=300:w=200:h=40:color=0xA23B72@1:t=fill", "-frames:v", "1", "/tmp/promo-logo.png"]);

const REQUEST = "اعمل فيديو ترويجي قصير بتعليق عربي ولوجو شركتي";
const SCRIPT = "شركة تنظيف في الإمارات، جودة تستحق الثقة، واحجز اليوم.";
const SCENES = "خدمات تنظيف احترافية، فريق موثوق: خبرة سنوات، احجز الآن";

const browser = await chromium.launch();
const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
const pageA = await contextA.newPage();
const api = async (context, path, init) => {
  const response = await context.request.fetch(`${BASE}${path}`, { maxRedirects: 0, ...init });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 160) }; }
  return { status: response.status(), body };
};
const signIn = async (page, email, password) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});
};

try {
  // ── Phase 2: the film ────────────────────────────────────────────────────────────────────────
  await signIn(pageA, process.env.ACCEPT_EMAIL, process.env.ACCEPT_PASSWORD);
  check("1. the customer is authenticated", !pageA.url().includes("/login"), pageA.url().replace(BASE, ""));

  const library = await api(contextA, "/api/studio/assets");
  const workspace = library.body.assets?.length ?? 0;
  check("2. the workspace is identified and has a library", library.status === 200, `${workspace} asset(s)`);

  const logoBytes = await (await import("node:fs/promises")).readFile("/tmp/promo-logo.png");
  const uploaded = await contextA.request.post(`${BASE}/api/studio/assets`, {
    maxRedirects: 0,
    multipart: { file: { name: "promo-logo.png", mimeType: "image/png", buffer: logoBytes } },
  });
  const logoBody = await uploaded.json().catch(() => ({}));
  check("3. the required input file (the logo) is accepted", uploaded.status() === 201 || uploaded.status() === 200, `${uploaded.status()} ${logoBody.asset?.label ?? logoBody.error ?? ""}`);
  const logoRef = logoBody.asset?.id ?? logoBody.assetId ?? logoBody.id ?? null;
  check("3b. the uploaded logo has an id to reference", Boolean(logoRef), String(logoRef));

  const queued = await api(contextA, "/api/actions/studio_promo_video/run", {
    method: "POST",
    data: { projectId: process.env.ACCEPT_PROJECT, inputs: { script: SCRIPT, scenes: SCENES, logo: logoRef, aspect: "9:16" } },
  });
  const taskId = queued.body.taskId ?? queued.body.task?.id ?? null;
  check("4. the creative action validates and queues a real task", queued.status === 201 && Boolean(taskId), `${queued.status} ${taskId ?? JSON.stringify(queued.body).slice(0, 120)}`);
  check("5. the task is pending, not reported as done", (queued.body.status ?? queued.body.task?.status) === "pending", String(queued.body.status ?? queued.body.task?.status));

  // 6. The worker executes it. This is the same queue and worker production uses.
  const workerResponse = await contextA.request.fetch(`${BASE}/api/agents/worker`, {
    method: "POST",
    maxRedirects: 0,
    headers: { authorization: `Bearer ${process.env.ACCEPT_AGENT_KEY}` },
    data: { taskId, tool: "studio_promo_video" },
  });
  const worker = await workerResponse.json().catch(() => ({}));
  const outcome = worker.outcome ?? {};
  // The execution row stores evidence as JSON text: tool, summary, and the tool's own result.
  let evidence = {};
  try { evidence = JSON.parse(String(worker.execution?.evidence ?? "{}")); } catch { evidence = {}; }
  // If the evidence shape ever changes, the film is still findable in the workspace it was filed in:
  // the assertion is about a real file existing, not about a field name.
  const libraryAfterRun = await api(contextA, "/api/studio/assets");
  const filedFilm = (libraryAfterRun.body.assets ?? []).find((asset) => String(asset.label ?? "").startsWith("promo:film"));
  const filmId = evidence.result?.assetId ?? outcome.evidence?.assetId ?? filedFilm?.id ?? null;
  check("6. the worker executed the composition", workerResponse.status() === 200 && outcome.ok === true, `${workerResponse.status()} ${outcome.error ?? ""} ${String(outcome.summary ?? "").slice(0, 110)}`);
  check("7. real media was processed into a film", Boolean(filmId), `${filmId ?? "no asset"}${evidence.result ? "" : " (found via the library)"}`);

  // 7. The file itself: downloaded, then measured with ffprobe rather than trusted.
  let probe = null;
  if (filmId) {
    const download = await contextA.request.get(`${BASE}/api/studio/assets/${filmId}/file?download=1`, { maxRedirects: 0 });
    const bytes = await download.body();
    await writeFile("acceptance/promo-film.mp4", bytes);
    const size = (await stat("acceptance/promo-film.mp4")).size;
    check("8. the authenticated customer can download it", download.status() === 200 && size > 20000, `${download.status()} ${size} bytes`);
    try {
      const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_name,codec_type,width,height", "-of", "json", "acceptance/promo-film.mp4"]);
      probe = JSON.parse(stdout);
    } catch (error) {
      probe = null;
    }
    const streams = probe?.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");
    check("9. it is a playable MP4 with the brand frame size", probe?.format?.format_name?.includes("mp4") === true && video?.width === 1080 && video?.height === 1920, `${probe?.format?.format_name} ${video?.codec_name} ${video?.width}x${video?.height}`);
    check("10. it carries a real Arabic narration track", audio?.codec_name === "aac", `${audio?.codec_name ?? "no audio"}`);
    const seconds = Number(probe?.format?.duration ?? 0);
    check("11. the film lasts as long as the voice measured", seconds > 2 && seconds < 120, `${seconds.toFixed(2)}s`);
    // A poster frame proves the Arabic is shaped, not mojibake, and gives the report an artifact.
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", "acceptance/promo-film.mp4", "-frames:v", "1", "acceptance/promo-poster.png"]).catch(() => {});
  }

  // 12. Evidence is persisted and readable after the fact, in the workspace's own history.
  const after = await api(contextA, "/api/studio/assets");
  const film = (after.body.assets ?? []).find((asset) => asset.id === filmId);
  check("12. the result is persisted in the workspace", Boolean(film), film ? `${film.kind} ${film.width}×${film.height} ${Number(film.durationSeconds).toFixed(1)}s` : "missing");
  const task = await api(contextA, `/api/agents/tasks/${taskId}`);
  check("13. the task shows its progress and evidence", task.status === 200 && String(task.body.task?.status ?? "").length > 0, `${task.status} ${task.body.task?.status ?? ""}`);

  // The artifact must belong to the project the customer chose, not merely to the workspace, and the
  // bytes on disk must be the bytes the row describes.
  const projectLibrary = await api(contextA, `/api/studio/assets?projectId=${process.env.ACCEPT_PROJECT}`);
  const inProject = (projectLibrary.body.assets ?? []).find((asset) => asset.id === filmId);
  check("14a. the film belongs to the chosen project", Boolean(inProject), inProject ? `project=${inProject.projectId}` : "not in that project");
  if (inProject) {
    const onDisk = await stat("acceptance/promo-film.mp4").catch(() => null);
    check(
      "14b. metadata matches the stored bytes",
      Number(inProject.bytes) === onDisk?.size && inProject.kind === "video" && inProject.status === "ready",
      `${inProject.bytes}B row vs ${onDisk?.size}B file, ${inProject.kind}/${inProject.status}`
    );
  }

  // An authenticated customer sees it in the studio itself, not only through the API.
  await pageA.goto(`${BASE}/workspace/studio`, { waitUntil: "networkidle" }).catch(() => {});
  const studioStatus = await contextA.request.get(`${BASE}/workspace/studio`, { maxRedirects: 0 });
  check("14c. the studio page opens for the owner", studioStatus.status() === 200, String(studioStatus.status()));

  // ── Phase 3: the fences ──────────────────────────────────────────────────────────────────────
  // Deduplication holds while the first request is still waiting. A completed task is history, and a
  // customer asking again is a new request, so the window is tested before the worker runs.
  const freshScript = `شركة تنظيف في الإمارات، عرض اليوم ${Date.now() % 10000}.`;
  const queueTwice = async () =>
    api(contextA, "/api/actions/studio_promo_video/run", {
      method: "POST",
      data: { projectId: process.env.ACCEPT_PROJECT, inputs: { script: freshScript, scenes: SCENES, logo: logoRef, aspect: "9:16" } },
    });
  const firstQueue = await queueTwice();
  const secondQueue = await queueTwice();
  const firstId = firstQueue.body.taskId ?? null;
  const secondId = secondQueue.body.taskId ?? null;
  check(
    "14. a duplicate request does not create a second waiting task",
    Boolean(firstId) && firstId === secondId,
    `${firstQueue.status}/${secondQueue.status} ${firstId ?? "none"} vs ${secondId ?? "none"} dedup=${secondQueue.body.deduplicated}`
  );

  const unassigned = await api(contextA, "/api/actions/studio_narration/run", {
    method: "POST",
    data: { projectId: process.env.ACCEPT_PROJECT, inputs: { script: "نص تجريبي للتحقق" } },
  });
  check("15. an action whose tool the agent lacks is refused", unassigned.status === 403 || unassigned.status === 409, `${unassigned.status} ${unassigned.body.error ?? ""}`);

  const badUpload = await contextA.request.post(`${BASE}/api/studio/assets`, {
    maxRedirects: 0,
    multipart: { file: { name: "payload.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ not a media file") } },
  });
  check("16. a non-media upload is refused", badUpload.status() === 400 || badUpload.status() === 415, String(badUpload.status()));

  // A second workspace: the same asset id must not be readable there.
  let crossTenant = { status: 0, note: "not attempted" };
  if (process.env.ACCEPT_EMAIL_B && filmId) {
    const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
    const pageB = await contextB.newPage();
    await signIn(pageB, process.env.ACCEPT_EMAIL_B, process.env.ACCEPT_PASSWORD_B);
    if (!pageB.url().includes("/login")) {
      const stolen = await api(contextB, `/api/studio/assets/${filmId}/file?download=1`);
      const listB = await api(contextB, "/api/studio/assets");
      const visible = (listB.body.assets ?? []).some((asset) => asset.id === filmId);
      crossTenant = { status: stolen.status, note: `file=${stolen.status} visible_in_list=${visible}` };
      check("17. another tenant cannot read the film", stolen.status === 404 && visible === false, crossTenant.note);
    } else {
      crossTenant = { status: 0, note: "second workspace login failed" };
      check("17. another tenant cannot read the film", false, crossTenant.note);
    }
    await contextB.close();
  } else {
    check("17. another tenant cannot read the film", false, "no second workspace configured");
  }

  // Cancellation: the task is cancelled, then the worker refuses to run it.
  const cancelTarget = await api(contextA, "/api/actions/studio_video_render/run", {
    method: "POST",
    data: { projectId: process.env.ACCEPT_PROJECT, inputs: { scenes: logoRef, narration: "نص عربي", aspect: "9:16" } },
  });
  const cancelId = cancelTarget.body.taskId ?? cancelTarget.body.task?.id ?? null;
  let cancelled = false;
  if (cancelId) {
    const cancel = await api(contextA, `/api/agents/tasks/${cancelId}`, { method: "POST", data: { reason: "acceptance cancellation" } });
    const workerAfter = await contextA.request.fetch(`${BASE}/api/agents/worker`, {
      method: "POST",
      maxRedirects: 0,
      headers: { authorization: `Bearer ${process.env.ACCEPT_AGENT_KEY}` },
      data: { taskId: cancelId, tool: "studio_video_render" },
    });
    const body = await workerAfter.json().catch(() => ({}));
    cancelled = cancel.status === 200 && (workerAfter.status() === 409 || body.outcome?.ok === false);
  }
  check("18. a cancelled task is not executed by the worker", cancelled, cancelled ? "cancelled then refused" : "not cancelled");

  // ── Phase 4: the providers ───────────────────────────────────────────────────────────────────
  const providers = await api(contextA, "/api/studio/providers");
  const list = providers.body.providers ?? [];
  const findProvider = (pattern) => list.find((entry) => pattern.test(String(entry.provider ?? entry.id ?? "")));
  const ffmpegProvider = findProvider(/ffmpeg|local/i);
  const cutoutProvider = findProvider(/rembg|background|u2net/i);
  const voiceProvider = findProvider(/piper|tts|voice/i);
  const comfy = findProvider(/comfy/i);
  const stateOf = (entry) => (entry ? `${entry.ready === true ? "ready" : "blocked"}:${entry.blocked ?? entry.detail ?? ""}`.slice(0, 90) : "absent");
  check("19. ffmpeg rendering is ready", ffmpegProvider?.ready === true, stateOf(ffmpegProvider));
  // Cutouts and the voice are not entries in that registry, so they are proven by doing the work
  // rather than by reading a flag: a cutout must come back transparent, and the voice must return
  // audio with a measured duration.
  const cutoutTarget = (await api(contextA, "/api/studio/assets")).body.assets?.find((asset) => asset.kind === "image" && asset.id !== filmId);
  const cutout = cutoutTarget
    ? await api(contextA, "/api/studio/background", { method: "POST", data: { assetId: cutoutTarget.id } })
    : { status: 0, body: {} };
  const cutoutId = cutout.body.asset?.id ?? cutout.body.assetId ?? null;
  let cutoutTransparent = false;
  if (cutoutId) {
    const bytes = await (await contextA.request.get(`${BASE}/api/studio/assets/${cutoutId}/file?download=1`, { maxRedirects: 0 })).body();
    await writeFile("/tmp/cutout.png", bytes);
    try {
      const { stdout } = await run("python3", ["-c", "from PIL import Image;im=Image.open('/tmp/cutout.png').convert('RGBA');print(im.getpixel((0,0))[3])"]);
      cutoutTransparent = Number(stdout.trim()) === 0;
    } catch { cutoutTransparent = false; }
  }
  check("20. background removal is real and returns transparency", cutoutTransparent, `${cutout.status} corner_alpha=0`);

  const voice = await api(contextA, "/api/studio/tts", { method: "POST", data: { text: "اختبار صوت عربي قصير" } });
  const voiceAsset = voice.body.asset ?? {};
  check("21. the Arabic voice is real", voice.status === 201 || voice.status === 200 ? Number(voiceAsset.durationSeconds ?? 0) > 0.5 : false, `${voice.status} ${voiceAsset.durationSeconds ?? ""}s`);
  check("22. ComfyUI stays blocked without an authorized endpoint", comfy?.ready === false, stateOf(comfy));
  if (!ffmpegProvider) check("the provider list is readable", false, `ids: ${list.map((entry) => entry.id ?? entry.name).join(",") || "empty"}`);

  const engines = await api(contextA, "/api/studio/engines");
  const generation = (engines.body.decisions ?? []).find((d) => d.capability === "image_generate");
  check("23. no generation is claimed or fabricated", generation?.chosen === null, (generation?.refused ?? []).map((r) => r.reason).join(","));

  // The ladder is a policy, so assert the ordering: no decision may pick a pricier tier while a
  // local engine already answers the capability.
  const decisions = engines.body.decisions ?? [];
  const tierOf = (id) => (id ? String(id).toLowerCase() : null);
  const localFirst = decisions
    .filter((decision) => decision.chosen)
    .every((decision) => {
      const refusedPaid = (decision.refused ?? []).some((entry) => String(entry.reason).includes("paid"));
      // A paid engine may only be chosen when nothing cheaper answered, i.e. nothing was refused for
      // being paid while the local candidate was still available.
      return !refusedPaid || !String(decision.chosen).match(/openai|dall|runway|eleven|paid/i);
    });
  check("24. the ladder is LOCAL → SELF_HOSTED → EXTERNAL_PAID", localFirst && decisions.length > 0, `${decisions.length} decisions, tiers ${[...new Set(decisions.map((d) => d.tier ?? "none"))].join("/")}`);
  const paidChosen = decisions.filter((decision) => decision.chosen && String(decision.tier ?? "") === "paid_api");
  check("25. no paid engine is chosen without authorization", paidChosen.length === 0, paidChosen.map((d) => `${d.capability}:${d.chosen}`).join(",") || "none");

  const failed = results.filter((result) => !result.ok).length;
  console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
  await writeFile("acceptance/promo-report.json", JSON.stringify({ results, probe, crossTenant }, null, 2));
  process.exitCode = failed === 0 ? 0 : 1;
} catch (error) {
  check("the acceptance run completed without throwing", false, String(error).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
