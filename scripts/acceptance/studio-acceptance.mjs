// Real studio acceptance: upload, edit, download, render an MP4, and check it with ffprobe.
import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const run = promisify(execFile);
const BASE = process.env.ACCEPT_BASE_URL;
const EMAIL = process.env.ACCEPT_EMAIL;
const PASSWORD = process.env.ACCEPT_PASSWORD;
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

await mkdir("acceptance", { recursive: true });

// Real input files, produced locally with ffmpeg so nothing is downloaded from anywhere.
await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1200x900:duration=1", "-frames:v", "1", "/tmp/studio-a.png"]);
await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "smptebars=size=900x1200:duration=1", "-frames:v", "1", "/tmp/studio-b.png"]);
await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac", "/tmp/studio-audio.m4a"]);

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const api = async (path, init) => {
  const response = await context.request.fetch(`${BASE}${path}`, { maxRedirects: 0, ...init });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 120) }; }
  return { status: response.status(), body };
};
const signIn = async (target, email, password) => {
  await target.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await target.fill("#email", email);
  await target.fill("#password", password);
  await target.click('button[type="submit"]');
  await target.waitForURL((url) => !String(url).includes("/login"), { timeout: 30000 }).catch(() => {});
};
const uploadFile = async (path, mimeType) => {
  const bytes = await (await import("node:fs/promises")).readFile(path);
  const response = await context.request.post(`${BASE}/api/studio/assets`, {
    maxRedirects: 0,
    multipart: { file: { name: path.split("/").pop(), mimeType, buffer: bytes } },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status(), body };
};

try {
  await signIn(page, EMAIL, PASSWORD);

  // 1. a real image lands, and the server measured it itself
  const first = await uploadFile("/tmp/studio-a.png", "image/png");
  const firstId = first.body.asset?.id ?? null;
  check("a real image uploads", first.status === 201 && Boolean(firstId), `status ${first.status}`);
  check("its dimensions were read from the file, not the client", first.body.asset?.width === 1200 && first.body.asset?.height === 900, `${first.body.asset?.width}×${first.body.asset?.height}`);
  const second = await uploadFile("/tmp/studio-b.png", "image/png");
  const secondId = second.body.asset?.id ?? null;
  check("a second image uploads", second.status === 201 && Boolean(secondId), `status ${second.status}`);
  const audio = await uploadFile("/tmp/studio-audio.m4a", "audio/mp4");
  check("a real audio file uploads", audio.status === 201, `status ${audio.status}`);

  // 2. an edit produces a new asset with lineage, and it is a real PNG
  const edited = await api("/api/studio/edit", {
    method: "POST",
    data: { kind: "image", assetId: firstId, operation: { op: "resize", width: 1080, height: 1920 } },
  });
  const editedId = edited.body.asset?.id ?? null;
  check("resize produces a new asset", edited.status === 201 && edited.body.asset?.width === 1080 && edited.body.asset?.height === 1920, `${edited.body.asset?.width}×${edited.body.asset?.height} ${edited.body.error ?? ""}`);
  check("the derivative keeps its parent, so the original is not overwritten", edited.body.asset?.parentAssetId === firstId, String(edited.body.asset?.parentAssetId));

  const cropped = await api("/api/studio/edit", {
    method: "POST",
    data: { kind: "image", assetId: secondId, operation: { op: "crop", width: 600, height: 600, x: 100, y: 100 } },
  });
  check("crop produces the requested size", cropped.body.asset?.width === 600 && cropped.body.asset?.height === 600, `${cropped.body.asset?.width}×${cropped.body.asset?.height}`);

  // 3. the edited bytes are downloadable and really are a PNG
  const download = await context.request.get(`${BASE}/api/studio/assets/${editedId}/file?download=1`, { maxRedirects: 0 });
  const downloaded = await download.body();
  await writeFile("acceptance/studio-edited.png", downloaded);
  check("the edited image downloads as PNG bytes", download.status() === 200 && download.headers()["content-type"] === "image/png" && downloaded.length > 5000, `${downloaded.length} bytes`);

  // 4. a real MP4 is rendered here, and ffprobe verifies the file we got back
  const render = await api("/api/studio/render", {
    method: "POST",
    data: {
      aspect: "9:16",
      scenes: [
        { assetId: editedId, seconds: 2 },
        { assetId: cropped.body.asset?.id, seconds: 2 },
      ],
      audioAssetId: audio.body.asset?.id ?? null,
    },
  });
  const videoId = render.body.asset?.id ?? null;
  check("render returns an asset", render.status === 201 && Boolean(videoId), `${render.status} ${render.body.error ?? ""}`);
  check("the render reports the 9:16 frame", render.body.asset?.width === 1080 && render.body.asset?.height === 1920, `${render.body.asset?.width}×${render.body.asset?.height}`);

  const videoDownload = await context.request.get(`${BASE}/api/studio/assets/${videoId}/file?download=1`, { maxRedirects: 0 });
  const videoBytes = await videoDownload.body();
  await writeFile("acceptance/studio-render.mp4", videoBytes);
  check("the MP4 downloads", videoDownload.status() === 200 && videoBytes.length > 20000, `${videoBytes.length} bytes`);

  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "acceptance/studio-render.mp4"])).stdout);
  const video = probe.streams.find((s) => s.codec_type === "video");
  const hasAudio = probe.streams.some((s) => s.codec_type === "audio");
  const duration = Number(probe.format.duration);
  check("the MP4 is H.264 at 1080×1920", video?.codec_name === "h264" && video?.width === 1080 && video?.height === 1920, `${video?.codec_name} ${video?.width}×${video?.height}`);
  check("the MP4 really is about four seconds of two scenes", duration >= 3.5 && duration <= 5, `${duration.toFixed(2)}s`);
  check("the audio track was muxed", hasAudio, hasAudio ? "audio present" : "no audio");

  // 4b. audio: a real gain edit and a real voiceover mix, both measured
  const gained = await api("/api/studio/edit", {
    method: "POST",
    data: { kind: "audio", assetId: audio.body.asset?.id, op: "gain", gainDb: -6 },
  });
  check("an audio gain edit produces a new asset", gained.status === 201 && gained.body.asset?.kind === "audio", `${gained.status} ${gained.body.error ?? ""}`);
  const audioDownload = await context.request.get(`${BASE}/api/studio/assets/${gained.body.asset?.id}/file?download=1`, { maxRedirects: 0 });
  const audioBytes = await audioDownload.body();
  await writeFile("acceptance/studio-audio.m4a", audioBytes);
  check("the audio download is a file, not an error document", audioDownload.status() === 200 && audioBytes.length > 1000, `${audioDownload.status()} ${audioBytes.length} bytes`);
  const audioProbe = JSON.parse((await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "acceptance/studio-audio.m4a"])).stdout);
  const audioStream = (audioProbe.streams ?? []).find((s) => s.codec_type === "audio");
  check("the edited audio is a real AAC file with a duration", Boolean(audioStream) && Number(audioProbe.format.duration) > 1, `${Number(audioProbe.format.duration).toFixed(2)}s ${audioStream?.codec_name}`);

  const mixed = await api("/api/studio/edit", {
    method: "POST",
    data: { kind: "audio", assetId: audio.body.asset?.id, op: "mix", voiceoverAssetId: gained.body.asset?.id, gainDb: -8 },
  });
  check("a voiceover mix produces a new asset", mixed.status === 201, `${mixed.status} ${mixed.body.error ?? ""}`);

  // 4c. scenes carry titles and a real fade transition
  const titled = await api("/api/studio/render", {
    method: "POST",
    data: {
      aspect: "1:1",
      scenes: [
        { assetId: editedId, seconds: 1.5, title: "عرض خاص", transition: "fade" },
        { assetId: cropped.body.asset?.id, seconds: 1.5, transition: "fade" },
      ],
      audioAssetId: mixed.body.asset?.id ?? null,
      label: "square-with-titles",
    },
  });
  check("a scene with a title and fade renders", titled.status === 201 && titled.body.asset?.width === 1080, `${titled.status} ${titled.body.error ?? ""} ${titled.body.asset?.width}×${titled.body.asset?.height}`);
  const titledDownload = await context.request.get(`${BASE}/api/studio/assets/${titled.body.asset?.id}/file?download=1`, { maxRedirects: 0 });
  await writeFile("acceptance/studio-square.mp4", await titledDownload.body());
  const squareProbe = JSON.parse((await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "acceptance/studio-square.mp4"])).stdout);
  const squareVideo = squareProbe.streams.find((s) => s.codec_type === "video");
  check("the 1:1 render is really 1080×1080 H.264", squareVideo?.width === 1080 && squareVideo?.height === 1080 && squareVideo?.codec_name === "h264", `${squareVideo?.width}×${squareVideo?.height} ${squareVideo?.codec_name}`);

  // 5. the provider panel tells the truth about generation
  const providers = await api("/api/studio/providers");
  const localReady = (providers.body.providers ?? []).find((p) => p.provider === "local-ffmpeg")?.ready === true;
  const comfyBlocked = (providers.body.providers ?? []).find((p) => p.provider === "comfyui");
  check("the local provider is reported ready", localReady, "local-ffmpeg");
  check("ComfyUI reports its exact blocker instead of pretending", comfyBlocked?.ready === false && Boolean(comfyBlocked?.blocked), `${comfyBlocked?.blocked ?? "missing"}`);
  const generate = await api("/api/studio/generate", { method: "POST", data: { prompt: "لوحة تنظيف أنيقة", capability: "image" } });
  check("generation is refused with blockers, never faked", generate.status === 409 && generate.body.error === "no_provider_ready", `${generate.status} ${(generate.body.blockers ?? []).join(",")}`);

  // 6. honest refusal: AI generation is not connected, and it says so
  const fakeAi = await api("/api/studio/render", { method: "POST", data: { aspect: "4:3", scenes: [] } });
  check("an impossible render is refused with a reason", fakeAi.status === 400 && Boolean(fakeAi.body.error), `${fakeAi.status} ${fakeAi.body.error}`);

  // 6. another workspace cannot reach the asset
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const otherPage = await other.newPage();
  await signIn(otherPage, "other@acceptance.local", "AcceptanceOther-2026-z9");
  const foreignFile = await other.request.get(`${BASE}/api/studio/assets/${videoId}/file`, { maxRedirects: 0 });
  check("another workspace gets 404 for the file", foreignFile.status() === 404, `status ${foreignFile.status()}`);
  const foreignList = await other.request.get(`${BASE}/api/studio/assets`, { maxRedirects: 0 });
  const foreignBody = await foreignList.json().catch(() => ({}));
  check("another workspace sees none of these assets", (foreignBody.assets ?? []).length === 0, `${(foreignBody.assets ?? []).length} assets`);
  const foreignEdit = await other.request.post(`${BASE}/api/studio/edit`, {
    data: { kind: "image", assetId: firstId, operation: { op: "resize", width: 100, height: 100 } },
    maxRedirects: 0,
  });
  check("another workspace cannot edit the asset", foreignEdit.status() === 404, `status ${foreignEdit.status()}`);
  await other.close();

  // 7. the work survives logging out and back in
  await context.clearCookies();
  await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  const anonymous = await context.request.get(`${BASE}/api/studio/assets`, { maxRedirects: 0 });
  check("without a session the library is refused", anonymous.status() === 307 || anonymous.status() === 401, `status ${anonymous.status()}`);
  await signIn(page, EMAIL, PASSWORD);
  const afterLogin = await api("/api/studio/assets");
  const ids = (afterLogin.body.assets ?? []).map((a) => a.id);
  check("the assets persisted across logout and login", ids.includes(firstId) && ids.includes(videoId), `${ids.length} assets`);
  await page.goto(`${BASE}/workspace/studio`, { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: "acceptance/studio-panel.png", fullPage: true });
  check("the studio page renders the real library", text.includes("الاستوديو الإبداعي") && text.includes("مكتبة الوسائط"), `${text.length} chars`);
} catch (error) {
  check("studio acceptance run completed without throwing", false, String(error).slice(0, 240));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${passed}/${results.length} passed`);
