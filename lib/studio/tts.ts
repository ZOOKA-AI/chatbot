import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";
import { inspect, mediaRoot, StudioError } from "@/lib/studio/media";

const run = promisify(execFile);

/**
 * Arabic speech, on the customer's own machine.
 *
 * The engine is Piper (MIT): a neural text-to-speech runtime that runs on the CPU and needs no API key,
 * no account and no per-character billing. The voice is a separate file, because the voice is what
 * carries the licence: `ar_JO-kareem-medium` from the rhasspy/piper-voices collection is the Jordanian
 * Arabic voice used here, and its model card must be checked before commercial distribution. We never
 * ship a voice inside the repository; an operator points `STUDIO_PIPER_VOICE` at the .onnx file.
 *
 * What this does not do: it does not clone a voice, and it is not a match for a paid studio voice. It
 * produces intelligible Modern Standard Arabic at 22.05 kHz, which is enough for a narration track and
 * is stated as such rather than sold as something more.
 */

export type TtsStatus =
  | { ready: true; engine: "piper"; voice: string; license: string; detail: string }
  | { ready: false; engine: "piper"; blocked: string; detail: string };

export function voicePath(): string | null {
  const path = process.env.STUDIO_PIPER_VOICE?.trim();
  return path ? path : null;
}

let engineCache: { ok: boolean; detail: string } | null = null;

async function piperInstalled(): Promise<{ ok: boolean; detail: string }> {
  if (engineCache) return engineCache;
  const python = process.env.STUDIO_PYTHON ?? "python3";
  try {
    const { stdout } = await run(python, ["-c", "import piper; print('ok')"], { timeout: 60_000 });
    engineCache = { ok: stdout.trim() === "ok", detail: "piper (MIT)" };
  } catch {
    engineCache = { ok: false, detail: "install the engine with `pip install piper-tts`" };
  }
  return engineCache;
}

export async function ttsStatus(): Promise<TtsStatus> {
  const engine = await piperInstalled();
  if (!engine.ok) {
    return { ready: false, engine: "piper", blocked: "engine_missing", detail: engine.detail };
  }
  const path = voicePath();
  if (!path) {
    return {
      ready: false,
      engine: "piper",
      blocked: "voice_not_configured",
      detail: "set STUDIO_PIPER_VOICE to an .onnx Arabic voice file",
    };
  }
  try {
    await access(path);
    await access(`${path}.json`);
  } catch {
    return {
      ready: false,
      engine: "piper",
      blocked: "voice_file_missing",
      detail: "the voice .onnx and its .onnx.json must both exist",
    };
  }
  return {
    ready: true,
    engine: "piper",
    voice: path.split("/").pop() ?? path,
    license: "engine MIT; voice licence is on the model card (verify before commercial use)",
    detail: "offline neural TTS, CPU only",
  };
}

/** Arabic text, cleaned of the characters that would be spoken as punctuation noise. */
export function normaliseScript(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics and the tatweel
    .replace(/[*_#`>\[\]{}<>|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

/**
 * Synthesises a narration track and stores it as a real audio asset.
 *
 * The WAV that Piper writes is converted to AAC in an MP4 container with ffmpeg so it can be muxed into
 * a video without a second pass, and the duration is measured from the file rather than assumed from
 * the character count.
 */
export async function synthesizeArabic(input: {
  organizationId: string;
  text: string;
  createdBy?: string | null;
  projectId?: string | null;
  label?: string | null;
}) {
  const status = await ttsStatus();
  if (!status.ready) throw new StudioError(status.blocked, status.detail);

  const script = normaliseScript(input.text);
  if (script.length < 2) throw new StudioError("empty_script");
  // Arabic must actually be present: synthesising Latin text with an Arabic voice produces nonsense.
  if (!/[\u0621-\u064A]/.test(script)) throw new StudioError("not_arabic");

  const id = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const wavPath = join(directory, `${id}.wav`);
  const m4aPath = join(directory, `${id}.m4a`);
  const python = process.env.STUDIO_PYTHON ?? "python3";

  try {
    // Piper reads the script from stdin so a long sentence never lands in a shell argument.
    const child = run(
      python,
      ["-m", "piper", "--model", status.voice === voicePath() ? status.voice : String(voicePath()), "--output_file", wavPath],
      { timeout: Number(process.env.STUDIO_TTS_TIMEOUT_MS ?? 180_000), maxBuffer: 8 * 1024 * 1024 }
    );
    child.child.stdin?.end(script);
    await child;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError("tts_failed", message.slice(0, 300));
  }

  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wavPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k", m4aPath]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError("encode_failed", message.slice(0, 300));
  } finally {
    await unlink(wavPath).catch(() => undefined);
  }

  const details = await inspect(m4aPath);
  const bytes = (await stat(m4aPath)).size;
  const [row] = await db
    .insert(schema.studioAsset)
    .values({
      id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      kind: "audio",
      source: "derived",
      storagePath: m4aPath,
      mimeType: "audio/mp4",
      bytes,
      durationSeconds: details.durationSeconds === null ? null : String(details.durationSeconds.toFixed(3)),
      status: "ready",
      operation: {
        op: "tts_arabic",
        engine: "piper",
        engineLicense: "MIT",
        voice: status.voice.split("/").pop(),
        characters: script.length,
      },
      label: input.label ?? "tts:narration",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

/** Reads back the stored audio, used by the acceptance run to prove the bytes are speech. */
export async function readAudio(path: string): Promise<Buffer> {
  return readFile(path);
}
