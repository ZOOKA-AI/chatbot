import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { and, desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";

const run = promisify(execFile);

/**
 * The studio's media layer: real files, real ffmpeg, real bytes back.
 *
 * Nothing here calls a generative provider. Every operation is deterministic and reproducible from
 * the stored operation parameters, which is why the panel can honestly say what produced an asset.
 * The bytes live under `<root>/<organizationId>/<assetId><ext>`; the path is computed from the row,
 * never accepted from a request, so an id from another workspace leads nowhere.
 */

export type AssetKind = "image" | "video" | "audio";

const LIMITS: Record<AssetKind, number> = {
  image: 20 * 1024 * 1024,
  video: 220 * 1024 * 1024,
  audio: 40 * 1024 * 1024,
};

const MIME: Record<string, { kind: AssetKind; ext: string }> = {
  "image/png": { kind: "image", ext: ".png" },
  "image/jpeg": { kind: "image", ext: ".jpg" },
  "image/webp": { kind: "image", ext: ".webp" },
  "video/mp4": { kind: "video", ext: ".mp4" },
  "video/quicktime": { kind: "video", ext: ".mov" },
  "audio/mpeg": { kind: "audio", ext: ".mp3" },
  "audio/wav": { kind: "audio", ext: ".wav" },
  "audio/mp4": { kind: "audio", ext: ".m4a" },
};

export function mediaRoot(): string {
  return process.env.STUDIO_MEDIA_DIR ?? "/tmp/zooka-studio";
}

export class StudioError extends Error {
  constructor(readonly code: string, readonly detail: string | null = null) {
    super(code);
  }
}

/** What a browser is allowed to hand us: a declared type we know, and a size inside the limit. */
export function acceptUpload(input: { mimeType: string; bytes: number }): { kind: AssetKind; ext: string } {
  const known = MIME[input.mimeType.toLowerCase().split(";")[0].trim()];
  if (!known) throw new StudioError("unsupported_type", input.mimeType);
  if (input.bytes <= 0) throw new StudioError("empty_file");
  if (input.bytes > LIMITS[known.kind]) throw new StudioError("file_too_large", `${input.bytes}`);
  return known;
}

async function ffprobeJson(path: string) {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    return JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
  } catch {
    return null;
  }
}

/** Dimensions and duration read from the file itself, not from the client. */
export async function inspect(
  path: string
): Promise<{ width: number | null; height: number | null; durationSeconds: number | null }> {
  const probe = await ffprobeJson(path);
  if (!probe) throw new StudioError("unreadable_media");
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = probe.format?.duration ? Number(probe.format.duration) : null;
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationSeconds: duration,
  };
}

export async function store(input: {
  organizationId: string;
  projectId: string | null;
  createdBy: string | null;
  mimeType: string;
  bytes: Buffer;
  label?: string | null;
}): Promise<InferSelectModel<typeof schema.studioAsset>> {
  const accepted = acceptUpload({ mimeType: input.mimeType, bytes: input.bytes.length });
  const assetId = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${assetId}${accepted.ext}`);
  await writeFile(path, input.bytes);

  let width: number | null = null;
  let height: number | null = null;
  let duration: number | null = null;
  let status = "ready";
  try {
    const details = await inspect(path);
    width = details.width;
    height = details.height;
    duration = details.durationSeconds;
  } catch {
    // A file ffprobe cannot read is kept and marked failed, never presented as usable.
    status = "failed";
  }

  const [row] = await db
    .insert(schema.studioAsset)
    .values({
      id: assetId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: accepted.kind,
      source: "upload",
      storagePath: path,
      mimeType: input.mimeType,
      bytes: input.bytes.length,
      width,
      height,
      durationSeconds: duration === null ? null : String(duration.toFixed(3)),
      status,
      label: input.label ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function listAssets(
  organizationId: string,
  options: { projectId?: string | null; limit?: number } = {}
) {
  const where = options.projectId
    ? and(
        eq(schema.studioAsset.organizationId, organizationId),
        eq(schema.studioAsset.projectId, options.projectId)
      )
    : eq(schema.studioAsset.organizationId, organizationId);
  return db
    .select()
    .from(schema.studioAsset)
    .where(where)
    .orderBy(desc(schema.studioAsset.createdAt))
    .limit(options.limit ?? 50);
}

export async function getAsset(organizationId: string, assetId: string) {
  const [row] = await db
    .select()
    .from(schema.studioAsset)
    .where(and(eq(schema.studioAsset.id, assetId), eq(schema.studioAsset.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function readAssetBytes(organizationId: string, assetId: string) {
  const asset = await getAsset(organizationId, assetId);
  if (!asset) throw new StudioError("asset_not_found");
  if (asset.status !== "ready") throw new StudioError("asset_not_ready");
  const bytes = await readFile(asset.storagePath);
  return { asset, bytes };
}

/** Quota: a workspace cannot fill the disk by uploading, whatever it claims. */
export async function usage(organizationId: string): Promise<{ assets: number; bytes: number }> {
  const rows = await db
    .select({ bytes: schema.studioAsset.bytes })
    .from(schema.studioAsset)
    .where(eq(schema.studioAsset.organizationId, organizationId));
  return { assets: rows.length, bytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0) };
}

export const STUDIO_QUOTA_BYTES = Number(process.env.STUDIO_QUOTA_BYTES ?? 2_000_000_000);

export async function assertQuota(organizationId: string, incoming: number) {
  const used = await usage(organizationId);
  if (used.bytes + incoming > STUDIO_QUOTA_BYTES) {
    throw new StudioError("quota_exceeded", `${used.bytes}/${STUDIO_QUOTA_BYTES}`);
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError("ffmpeg_failed", message.slice(0, 400));
  }
}

export type ImageOperation =
  | { op: "resize"; width: number; height: number }
  | { op: "crop"; width: number; height: number; x: number; y: number }
  | { op: "text"; text: string; size?: number; color?: string; y?: number }
  | { op: "logo"; logoAssetId: string; scale?: number; corner?: "tl" | "tr" | "bl" | "br" };

/**
 * A deterministic image edit, done with ffmpeg.
 *
 * Text is drawn through libfreetype with an explicit font file when one is configured, because the
 * default filter cannot shape Arabic. When no font is available the operation is refused rather than
 * drawing something broken and calling it done.
 */
export async function editImage(input: {
  organizationId: string;
  assetId: string;
  operation: ImageOperation;
  projectId?: string | null;
  createdBy?: string | null;
}): Promise<InferSelectModel<typeof schema.studioAsset>> {
  const source = await getAsset(input.organizationId, input.assetId);
  if (!source) throw new StudioError("asset_not_found");
  if (source.kind !== "image") throw new StudioError("not_an_image");

  const outId = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const outPath = join(directory, `${outId}.png`);

  const op = input.operation;
  let args: string[];

  if (op.op === "resize") {
    if (op.width < 16 || op.width > 4096 || op.height < 16 || op.height > 4096) {
      throw new StudioError("invalid_dimensions");
    }
    args = ["-i", source.storagePath, "-vf", `scale=${op.width}:${op.height}:flags=lanczos`, outPath];
  } else if (op.op === "crop") {
    if (op.width < 16 || op.height < 16 || op.x < 0 || op.y < 0) throw new StudioError("invalid_dimensions");
    args = ["-i", source.storagePath, "-vf", `crop=${op.width}:${op.height}:${op.x}:${op.y}`, outPath];
  } else if (op.op === "text") {
    const font = process.env.STUDIO_FONT_FILE;
    if (!font) throw new StudioError("font_not_configured");
    const text = op.text.replace(/[\\:'%]/g, " ").slice(0, 120);
    if (!text.trim()) throw new StudioError("empty_text");
    const size = Math.min(Math.max(op.size ?? 48, 12), 200);
    const color = (op.color ?? "white").replace(/[^#a-zA-Z0-9]/g, "");
    const y = Math.min(Math.max(op.y ?? 40, 0), 4000);
    args = [
      "-i",
      source.storagePath,
      "-vf",
      `drawtext=fontfile=${font}:text='${text}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`,
      outPath,
    ];
  } else {
    const logo = await getAsset(input.organizationId, op.logoAssetId);
    if (!logo) throw new StudioError("logo_not_found");
    const scale = Math.min(Math.max(op.scale ?? 0.2, 0.05), 0.9);
    const corner = op.corner ?? "br";
    const position =
      corner === "tl" ? "20:20" : corner === "tr" ? "W-w-20:20" : corner === "bl" ? "20:H-h-20" : "W-w-20:H-h-20";
    args = [
      "-i",
      source.storagePath,
      "-i",
      logo.storagePath,
      "-filter_complex",
      `[1:v]scale=iw*${scale}:-1[logo];[0:v][logo]overlay=${position}`,
      "-frames:v",
      "1",
      outPath,
    ];
  }

  await ffmpeg(args);
  const details = await inspect(outPath);
  const bytes = (await stat(outPath)).size;

  const [row] = await db
    .insert(schema.studioAsset)
    .values({
      id: outId,
      organizationId: input.organizationId,
      projectId: input.projectId ?? source.projectId,
      kind: "image",
      source: "derived",
      storagePath: outPath,
      mimeType: "image/png",
      bytes,
      width: details.width,
      height: details.height,
      status: "ready",
      operation: op as unknown as Record<string, unknown>,
      parentAssetId: source.id,
      label: `edit:${op.op}`,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

export const ASPECTS = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const;

export type Aspect = keyof typeof ASPECTS;

/**
 * Render scenes into one MP4 with ffmpeg.
 *
 * Each scene is a still or a video with a duration; the result is scaled and padded to the requested
 * aspect so nothing is cropped away, joined with hard cuts, then muxed with an optional audio track.
 * The probe afterwards is the evidence: if ffprobe cannot read the output, the render failed.
 */
export async function renderVideo(input: {
  organizationId: string;
  projectId?: string | null;
  createdBy?: string | null;
  aspect: Aspect;
  scenes: Array<{ assetId: string; seconds: number; title?: string | null; transition?: "cut" | "fade" }>;
  audioAssetId?: string | null;
  label?: string | null;
}): Promise<InferSelectModel<typeof schema.studioAsset>> {
  if (input.scenes.length === 0) throw new StudioError("no_scenes");
  if (input.scenes.length > 12) throw new StudioError("too_many_scenes");
  const target = ASPECTS[input.aspect];
  if (!target) throw new StudioError("invalid_aspect");

  const sources = [];
  for (const scene of input.scenes) {
    const asset = await getAsset(input.organizationId, scene.assetId);
    if (!asset) throw new StudioError("asset_not_found");
    if (asset.kind !== "image" && asset.kind !== "video") throw new StudioError("not_visual_media");
    if (scene.seconds < 0.5 || scene.seconds > 30) throw new StudioError("invalid_scene_seconds");
    sources.push({ asset, seconds: scene.seconds, title: scene.title ?? null, transition: scene.transition ?? "cut" });
  }

  const audio = input.audioAssetId ? await getAsset(input.organizationId, input.audioAssetId) : null;
  if (input.audioAssetId && !audio) throw new StudioError("audio_not_found");

  const outId = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const outPath = join(directory, `${outId}.mp4`);

  const args: string[] = [];
  for (const source of sources) {
    if (source.asset.kind === "image") {
      args.push("-loop", "1", "-t", String(source.seconds), "-i", source.asset.storagePath);
    } else {
      args.push("-t", String(Math.min(source.seconds, 30)), "-i", source.asset.storagePath);
    }
  }
  if (audio) args.push("-i", audio.storagePath);

  const font = process.env.STUDIO_FONT_FILE;
  const filters = sources
    .map((scene, index) => {
      const chain = [
        `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease`,
        `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        "fps=30",
        "setsar=1",
      ];
      // A title is drawn only when a font capable of the script is configured; otherwise the scene is
      // rendered without it rather than with broken glyphs.
      const title = scene.title?.replace(/[\\:'%]/g, " ").slice(0, 80).trim();
      if (title && font) {
        chain.push(
          `drawtext=fontfile=${font}:text='${title}':fontsize=${Math.round(target.width / 22)}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=h-text_h-80`
        );
      }
      // A fade is a real transition on the scene's own timeline; the cut stays the default.
      if (scene.transition === "fade") {
        const out = Math.max(scene.seconds - 0.35, 0.1).toFixed(2);
        chain.push("fade=t=in:st=0:d=0.35", `fade=t=out:st=${out}:d=0.35`);
      }
      return `[${index}:v]${chain.join(",")}[s${index}]`;
    })
    .join(";");
  const concat = `${sources.map((_, index) => `[s${index}]`).join("")}concat=n=${sources.length}:v=1:a=0[vout]`;

  // The scenes decide how long the film is. A shorter music track simply ends; it must not cut the
  // picture, which is what `-shortest` would do.
  const totalSeconds = sources.reduce((sum, scene) => sum + scene.seconds, 0);
  args.push("-filter_complex", `${filters};${concat}`, "-map", "[vout]");
  if (audio) args.push("-map", `${sources.length}:a`, "-t", String(totalSeconds));
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath
  );

  await ffmpeg(args);
  const details = await inspect(outPath);
  const bytes = (await stat(outPath)).size;
  if (!details.width || !details.height || !details.durationSeconds) throw new StudioError("render_unreadable");

  const [row] = await db
    .insert(schema.studioAsset)
    .values({
      id: outId,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      kind: "video",
      source: "derived",
      storagePath: outPath,
      mimeType: "video/mp4",
      bytes,
      width: details.width,
      height: details.height,
      durationSeconds: String(details.durationSeconds.toFixed(3)),
      status: "ready",
      operation: {
        aspect: input.aspect,
        scenes: input.scenes,
        audioAssetId: input.audioAssetId ?? null,
        renderer: "ffmpeg/libx264",
      },
      label: input.label ?? `render:${input.aspect}`,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

/** Audio work that needs no provider: trim, gain, and mixing a voiceover over music. */
export async function editAudio(input: {
  organizationId: string;
  assetId: string;
  op?: "trim" | "gain" | "mix";
  start?: number;
  seconds?: number;
  gainDb?: number;
  voiceoverAssetId?: string | null;
  pressing?: boolean;
  createdBy?: string | null;
}): Promise<InferSelectModel<typeof schema.studioAsset>> {
  const source = await getAsset(input.organizationId, input.assetId);
  if (!source) throw new StudioError("asset_not_found");
  if (source.kind !== "audio") throw new StudioError("not_audio");

  const outId = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const outPath = join(directory, `${outId}.m4a`);

  const op = input.op ?? "trim";
  const args = ["-i", source.storagePath];

  if (op === "mix") {
    const voice = input.voiceoverAssetId ? await getAsset(input.organizationId, input.voiceoverAssetId) : null;
    if (!voice) throw new StudioError("voiceover_not_found");
    if (voice.kind !== "audio") throw new StudioError("not_audio");
    const musicDb = Math.min(Math.max(input.gainDb ?? -6, -40), 12);
    // Music sits under the voice by default; the voice is never attenuated.
    args.push("-i", voice.storagePath, "-filter_complex", `[0:a]volume=${musicDb}dB[music];[1:a]volume=0dB[voice];[music][voice]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[out]`, "-map", "[out]");
  } else if (op === "gain") {
    if (input.start !== undefined) args.push("-ss", String(Math.max(input.start, 0)));
    if (input.seconds !== undefined) args.push("-t", String(Math.min(Math.max(input.seconds, 0.5), 300)));
    const gain = Math.min(Math.max(input.gainDb ?? 0, -30), 20);
    args.push("-af", `volume=${gain}dB`);
  } else {
    if (input.start !== undefined) args.push("-ss", String(Math.max(input.start, 0)));
    if (input.seconds !== undefined) args.push("-t", String(Math.min(Math.max(input.seconds, 0.5), 300)));
    args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  }
  args.push("-c:a", "aac", "-b:a", "128k", outPath);

  await ffmpeg(args);
  const details = await inspect(outPath);
  const bytes = (await stat(outPath)).size;

  const [row] = await db
    .insert(schema.studioAsset)
    .values({
      id: outId,
      organizationId: input.organizationId,
      projectId: source.projectId,
      kind: "audio",
      source: "derived",
      storagePath: outPath,
      mimeType: "audio/mp4",
      bytes,
      durationSeconds: details.durationSeconds === null ? null : String(details.durationSeconds.toFixed(3)),
      status: "ready",
      operation: {
        op: op === "trim" ? "trim_normalise" : op,
        start: input.start ?? null,
        seconds: input.seconds ?? null,
        gainDb: input.gainDb ?? null,
        voiceoverAssetId: input.voiceoverAssetId ?? null,
      },
      parentAssetId: source.id,
      label: `edit:audio:${op}`,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

/** Remove an asset the customer owns; the bytes go with it. */
export async function deleteAsset(organizationId: string, assetId: string) {
  const asset = await getAsset(organizationId, assetId);
  if (!asset) throw new StudioError("asset_not_found");
  await db
    .delete(schema.studioAsset)
    .where(and(eq(schema.studioAsset.id, assetId), eq(schema.studioAsset.organizationId, organizationId)));
  await unlink(asset.storagePath).catch(() => undefined);
}
