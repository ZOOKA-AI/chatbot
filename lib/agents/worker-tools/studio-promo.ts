import "server-only";

import { StudioError } from "@/lib/studio/media";
import { composePromo, type PromoScene } from "@/lib/studio/promo";
import type { WorkerTool } from "../worker-types";
import { resolveAssetRef } from "./studio-media";

/**
 * The agent's promo film: one Arabic sentence in, a playable MP4 out.
 *
 * This is deterministic production, not generation: the frames are drawn from the customer's own
 * words and logo, and the voice is synthesised locally. It is registered as an internal writer
 * because it creates files and rows.
 */

function readScenes(payload: Record<string, unknown>): PromoScene[] {
  const raw = payload.scenes;
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      if (typeof entry === "string") return { title: entry };
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        title: String(record.title ?? ""),
        subtitle: record.subtitle == null ? null : String(record.subtitle),
      };
    });
  }
  // A single line of text with separators is accepted too: a customer typing one instruction should
  // not have to produce JSON.
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/[،,\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((title) => ({ title }));
}

export const studioPromoVideo: WorkerTool = {
  name: "studio_promo_video",
  description:
    "Composes a short promotional film from an Arabic narration script and scene titles: brand frames with the company logo, an Arabic voice, and a playable MP4. Deterministic production, not AI generation.",
  readOnly: false,
  internalWrite: true,
  // Composition runs several ffmpeg encodes and a Piper synthesis, so it needs the longer budget.
  timeoutMs: 180_000,
  maxAttempts: 1,
  async run({ organizationId, taskId, payload }) {
    const script = String(payload.script ?? payload.narration ?? "").trim();
    const scenes = readScenes(payload);
    if (scenes.length === 0) {
      return {
        ok: false,
        summary: "A promo needs one or more scene titles.",
        error: "no_scenes",
      };
    }

    try {
      const logoRef = payload.logo == null ? null : String(payload.logo).trim();
      const logo = logoRef ? await resolveAssetRef(organizationId, logoRef, "image") : null;
      if (logoRef && !logo) {
        return {
          ok: false,
          summary: "No image in this workspace matches the logo reference.",
          error: "logo_not_found",
        };
      }

      const backdropRefs = Array.isArray(payload.images) ? (payload.images as unknown[]).map((entry) => String(entry)) : [];
      const backdrops: string[] = [];
      for (const reference of backdropRefs) {
        const asset = await resolveAssetRef(organizationId, reference, "image");
        if (!asset) {
          return { ok: false, summary: `No image in this workspace matches "${reference}".`, error: "image_not_found" };
        }
        backdrops.push(asset.storagePath);
      }

      const aspect = payload.aspect == null ? undefined : (String(payload.aspect) as "9:16" | "1:1" | "16:9");
      const result = await composePromo({
        organizationId,
        createdBy: null,
        projectId: payload.projectId == null ? null : String(payload.projectId),
        script,
        scenes,
        aspect,
        logoAssetId: logo?.id ?? null,
        backdropStoragePaths: backdrops,
        label: payload.label == null ? "promo:film" : String(payload.label),
      });

      const produced = result.produced;
      return {
        ok: true,
        summary: `Composed a ${produced.width}×${produced.height} promo film of ${Number(produced.durationSeconds ?? 0).toFixed(1)}s with ${result.scenes} scene${result.scenes === 1 ? "" : "s"} and Arabic narration${logo ? " and the company logo" : ""}. It is in your studio and can be downloaded.`,
        evidence: {
          assetId: produced.id,
          narrationAssetId: result.narration.id,
          scenes: result.scenes,
          aspect: result.aspect,
          durationSeconds: produced.durationSeconds,
          bytes: produced.bytes,
          taskId: taskId ?? null,
          engine: "local-ffmpeg+piper",
        },
      };
    } catch (error) {
      if (error instanceof StudioError) {
        return {
          ok: false,
          summary: `${error.code}${error.detail ? `: ${error.detail}` : ""}`.slice(0, 300),
          error: error.code,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, summary: "The promo composition failed.", error: message.slice(0, 200) };
    }
  },
};
