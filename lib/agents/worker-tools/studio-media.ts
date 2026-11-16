import { and, desc, eq, ilike } from "drizzle-orm";

import { commanderActiveDb } from "@/lib/db/tenant-context";
import * as queriesModule from "@/lib/db/queries";
import { studioAsset } from "@/lib/db/schema";
import type { WorkerTool } from "../worker-types";
import { removeBackground } from "@/lib/studio/background";
import { editAudio, editImage, renderVideo, StudioError, type Aspect, type ImageOperation } from "@/lib/studio/media";
import { synthesizeArabic } from "@/lib/studio/tts";

/**
 * The studio, as the agent can use it.
 *
 * Every one of these is a real operation on real files — no provider, no prompt-to-picture pretending.
 * They are `internalWrite` tools and named in INTERNAL_WRITE_TOOLS, because they create rows and files;
 * the worker refuses a writing tool that is not listed there, which is the guard that keeps this list
 * deliberate.
 *
 * Two rules hold across the file:
 *  - the workspace always comes from the run context, never from the payload;
 *  - an asset is referenced either by id or by the label the customer typed, and either way it must
 *    belong to this workspace, so a crafted payload cannot reach another tenant's media.
 */

const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the asset a customer referred to.
 *
 * An id is taken literally; anything else is treated as a label they typed, matched inside their own
 * workspace only, newest first. This is what lets an Arabic request say "الصورة" and still find the
 * file they uploaded a moment ago without exposing anyone else's library.
 */
export async function resolveAssetRef(organizationId: string, reference: string, kind?: "image" | "video" | "audio") {
  const ref = reference.trim();
  if (!ref) return null;
  if (UUID.test(ref)) {
    const [row] = await db
      .select()
      .from(studioAsset)
      .where(and(eq(studioAsset.id, ref), eq(studioAsset.organizationId, organizationId)))
      .limit(1);
    return row ?? null;
  }
  // Wildcards are stripped from a typed name, and a name that was nothing but wildcards is refused:
  // an empty pattern would otherwise match every asset in the workspace.
  const needle = ref.replace(/[%_\\]/g, "").trim();
  if (needle.length < 1) return null;
  const [row] = await db
    .select()
    .from(studioAsset)
    .where(
      and(
        eq(studioAsset.organizationId, organizationId),
        eq(studioAsset.status, "ready"),
        kind ? eq(studioAsset.kind, kind) : undefined,
        ilike(studioAsset.label, `%${needle}%`)
      )
    )
    .orderBy(desc(studioAsset.createdAt))
    .limit(1);
  return row ?? null;
}

function fail(error: unknown): { ok: false; summary: string; error: string } {
  if (error instanceof StudioError) return { ok: false, summary: `The studio refused the operation: ${error.code}`, error: error.code };
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, summary: "The studio operation failed.", error: message.slice(0, 120) };
}

/** The customer's media, so the agent can answer "what do I have?" without guessing. */
export const studioAssetList: WorkerTool = {
  name: "studio_asset_list",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 2,
  description: "Lists the media in this workspace with its measured size and duration, newest first.",
  async run({ organizationId }) {
    const rows = await db
      .select({
        id: studioAsset.id,
        kind: studioAsset.kind,
        label: studioAsset.label,
        width: studioAsset.width,
        height: studioAsset.height,
        bytes: studioAsset.bytes,
        durationSeconds: studioAsset.durationSeconds,
      })
      .from(studioAsset)
      .where(eq(studioAsset.organizationId, organizationId))
      .orderBy(desc(studioAsset.createdAt))
      .limit(20);
    return {
      ok: true,
      summary: `${rows.length} media asset${rows.length === 1 ? "" : "s"} in this workspace.`,
      evidence: { assets: rows },
    };
  },
};

/**
 * Deterministic image editing from an Arabic instruction.
 *
 * The instruction is read for the operation the customer asked for, and the numbers come with it. If
 * nothing recognisable is asked for, the tool says so instead of picking an edit on the customer's
 * behalf — an unrequested crop is not a helpful assumption.
 */
export function readImageInstruction(instruction: string): ImageOperation | null {
  const text = instruction.trim();
  if (/خلفي|خلفية|background/i.test(text)) return null; // handled by the background tool, never silently
  const size = text.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})/);
  const number = text.match(/(\d{2,4})/);
  if (/نص|عنوان|اكتب|text|caption/i.test(text)) {
    const quoted = text.match(/["«](.{1,100}?)["»]/)?.[1] ?? text.replace(/^.*?(?:نص|عنوان|اكتب)[:\s]*/i, "");
    const caption = quoted.trim();
    return caption.length >= 2 ? { op: "text", text: caption.slice(0, 100), size: 64, color: "white", y: 40 } : null;
  }
  if (/قص|crop/i.test(text) && size) {
    return { op: "crop", width: Number(size[1]), height: Number(size[2]), x: 0, y: 0 };
  }
  if (/كبّر|كبر|صغّر|صغر|مقاس|حجم|resize|scale/i.test(text)) {
    const width = size ? Number(size[1]) : number ? Number(number[1]) : 1080;
    const height = size ? Number(size[2]) : Math.round((width * 16) / 9);
    return { op: "resize", width, height };
  }
  return null;
}

export const studioImageEdit: WorkerTool = {
  name: "studio_image_edit",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 60_000,
  maxAttempts: 1,
  description:
    "Applies one deterministic edit to an image in this workspace — resize, crop, text or logo — and stores the result as a new asset that names its original.",
  async run({ organizationId, payload, signal }) {
    if (signal.aborted) return { ok: false, summary: "The run was cancelled before the edit.", error: "aborted" };
    const reference = String(payload.asset ?? "").trim();
    const instruction = String(payload.instruction ?? "").trim();
    const asset = await resolveAssetRef(organizationId, reference, "image");
    if (!asset) return { ok: false, summary: "No image in this workspace matches that reference.", error: "asset_not_found" };

    const operation = payload.operation as ImageOperation | undefined;
    const resolved = operation ?? readImageInstruction(instruction);
    if (!resolved) {
      return {
        ok: false,
        summary: "That instruction does not name an edit this studio performs. Available: resize, crop, text overlay, logo overlay, background removal.",
        error: "instruction_understood_as_nothing",
      };
    }
    try {
      const produced = await editImage({ organizationId, assetId: asset.id, operation: resolved });
      return {
        ok: true,
        summary: `Edited "${asset.label ?? asset.id.slice(0, 8)}" with ${resolved.op}. The result is ${produced.width}×${produced.height} and downloads from the studio.`,
        evidence: { assetId: produced.id, parentAssetId: asset.id, operation: resolved, bytes: produced.bytes },
      };
    } catch (error) {
      return fail(error);
    }
  },
};

/** Background removal, with the model's licence carried into the evidence. */
export const studioBackgroundRemove: WorkerTool = {
  name: "studio_background_remove",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 240_000,
  maxAttempts: 1,
  description:
    "Removes the background of an image in this workspace and keeps real transparency, using an on-premise segmentation model whose licence is checked first.",
  async run({ organizationId, payload, signal }) {
    if (signal.aborted) return { ok: false, summary: "The run was cancelled before the cutout.", error: "aborted" };
    const asset = await resolveAssetRef(organizationId, String(payload.asset ?? ""), "image");
    if (!asset) return { ok: false, summary: "No image in this workspace matches that reference.", error: "asset_not_found" };
    try {
      const produced = await removeBackground({
        organizationId,
        assetId: asset.id,
        model: payload.model ? String(payload.model) : null,
      });
      const operation = (produced.operation ?? {}) as { model?: string; license?: string };
      return {
        ok: true,
        summary: `Background removed from "${asset.label ?? asset.id.slice(0, 8)}" using ${operation.model} (${operation.license}). The cutout keeps its alpha channel.`,
        evidence: { assetId: produced.id, parentAssetId: asset.id, model: operation.model, license: operation.license, bytes: produced.bytes },
      };
    } catch (error) {
      return fail(error);
    }
  },
};

/** A real MP4 from the workspace's own media. */
export const studioVideoRender: WorkerTool = {
  name: "studio_video_render",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 300_000,
  maxAttempts: 1,
  description:
    "Renders 1-12 images or clips from this workspace into one MP4 with ffmpeg, at 9:16, 1:1 or 16:9, optionally with a narration track.",
  async run({ organizationId, payload, signal }) {
    if (signal.aborted) return { ok: false, summary: "The run was cancelled before the render.", error: "aborted" };
    const references = Array.isArray(payload.scenes) ? (payload.scenes as unknown[]) : [];
    if (references.length === 0) {
      return { ok: false, summary: "A render needs at least one scene.", error: "no_scenes" };
    }
    const scenes = [];
    for (const entry of references.slice(0, 12)) {
      const record = (typeof entry === "string" ? { asset: entry } : entry) as { asset?: string; seconds?: number; title?: string };
      const asset = await resolveAssetRef(organizationId, String(record.asset ?? ""));
      if (!asset) return { ok: false, summary: `No media in this workspace matches "${record.asset}".`, error: "asset_not_found" };
      scenes.push({
        assetId: asset.id,
        seconds: Math.min(Math.max(Number(record.seconds ?? 2), 0.5), 30),
        title: record.title ?? null,
      });
    }

    const audioRef = payload.audio ? String(payload.audio) : "";
    const audio = audioRef ? await resolveAssetRef(organizationId, audioRef, "audio") : null;
    if (audioRef && !audio) return { ok: false, summary: "The narration track was not found in this workspace.", error: "audio_not_found" };

    const aspect = (["9:16", "1:1", "16:9"].includes(String(payload.aspect)) ? String(payload.aspect) : "9:16") as Aspect;
    try {
      const produced = await renderVideo({
        organizationId,
        aspect,
        scenes,
        audioAssetId: audio?.id ?? null,
        label: `render:${aspect}`,
      });
      return {
        ok: true,
        summary: `Rendered ${scenes.length} scene${scenes.length === 1 ? "" : "s"} into a ${produced.width}×${produced.height} MP4 of ${Number(produced.durationSeconds ?? 0).toFixed(1)} seconds.`,
        evidence: { assetId: produced.id, aspect, scenes, bytes: produced.bytes, durationSeconds: produced.durationSeconds },
      };
    } catch (error) {
      return fail(error);
    }
  },
};

/** Arabic narration, synthesised locally, mux-ready. */
export const studioNarration: WorkerTool = {
  name: "studio_narration",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 240_000,
  maxAttempts: 1,
  description:
    "Synthesises an Arabic narration track offline with a local neural voice and stores it as an audio asset that a render can use.",
  async run({ organizationId, payload, signal }) {
    if (signal.aborted) return { ok: false, summary: "The run was cancelled before the narration.", error: "aborted" };
    const text = String(payload.text ?? "").trim();
    if (text.length < 2) return { ok: false, summary: "The narration text is empty.", error: "empty_script" };
    try {
      const produced = await synthesizeArabic({ organizationId, text, label: "tts:narration" });
      return {
        ok: true,
        summary: `Narrated ${text.length} characters of Arabic into ${Number(produced.durationSeconds ?? 0).toFixed(1)} seconds of audio.`,
        evidence: { assetId: produced.id, durationSeconds: produced.durationSeconds, engine: "piper" },
      };
    } catch (error) {
      return fail(error);
    }
  },
};

/** Audio trim, gain and voiceover mixing, for completeness of the studio surface. */
export const studioAudioEdit: WorkerTool = {
  name: "studio_audio_edit",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 120_000,
  maxAttempts: 1,
  description: "Trims, adjusts the level of, or mixes a voiceover over an audio asset in this workspace.",
  async run({ organizationId, payload }) {
    const asset = await resolveAssetRef(organizationId, String(payload.asset ?? ""), "audio");
    if (!asset) return { ok: false, summary: "No audio in this workspace matches that reference.", error: "asset_not_found" };
    const op = (["trim", "gain", "mix"].includes(String(payload.op)) ? String(payload.op) : "trim") as "trim" | "gain" | "mix";
    const voiceRef = payload.voiceover ? String(payload.voiceover) : "";
    const voice = voiceRef ? await resolveAssetRef(organizationId, voiceRef, "audio") : null;
    try {
      const produced = await editAudio({
        organizationId,
        assetId: asset.id,
        op,
        start: payload.start === undefined ? undefined : Number(payload.start),
        seconds: payload.seconds === undefined ? undefined : Number(payload.seconds),
        gainDb: payload.gainDb === undefined ? undefined : Number(payload.gainDb),
        voiceoverAssetId: voice?.id ?? null,
      });
      return {
        ok: true,
        summary: `Audio ${op} finished: ${Number(produced.durationSeconds ?? 0).toFixed(1)} seconds.`,
        evidence: { assetId: produced.id, parentAssetId: asset.id, op },
      };
    } catch (error) {
      return fail(error);
    }
  },
};
