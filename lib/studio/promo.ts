import "server-only";

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  ASPECTS,
  StudioError,
  renderVideo,
  store,
  type Aspect,
} from "./media";
import { synthesizeArabic } from "./tts";

const run = promisify(execFile);

/**
 * A promo film, composed deterministically.
 *
 * The customer writes one Arabic sentence and gets back a real MP4: brand frames carrying their
 * title and logo, and an Arabic narration track timed to those frames. Nothing here generates
 * imagery — the pictures are drawn from their words and their own logo — which is why this can run
 * on a CPU host with no provider, no key and no bill.
 *
 * Order matters and is deliberate: the narration is synthesised first, because its measured length
 * decides how long each scene is. Cutting the film first and hoping the voice fits would leave a
 * film that ends mid-sentence.
 */

export type PromoScene = { title: string; subtitle?: string | null };

export type PromoBrand = {
  from?: [number, number, number];
  to?: [number, number, number];
  accent?: [number, number, number];
  text?: [number, number, number];
};

export type ComposePromoInput = {
  organizationId: string;
  projectId?: string | null;
  createdBy?: string | null;
  script: string;
  scenes: PromoScene[];
  aspect?: Aspect;
  logoAssetId?: string | null;
  /** Local paths of already-resolved images, in scene order, used as backdrops. */
  backdropPaths?: string[];
  brand?: PromoBrand;
  label?: string | null;
};

const MAX_SCENES = 6;
const MAX_TITLE = 70;
const MAX_SUBTITLE = 90;
const MIN_SCRIPT = 8;
const MAX_SCRIPT = 400;

function cleanScene(scene: PromoScene, index: number): PromoScene {
  const title = String(scene.title ?? "").trim();
  const subtitle = String(scene.subtitle ?? "").trim();
  if (title.length < 2) throw new StudioError("scene_title_required", `scene ${index + 1} has no title`);
  if (title.length > MAX_TITLE) throw new StudioError("scene_title_too_long", `scene ${index + 1} title is ${title.length} characters`);
  if (subtitle.length > MAX_SUBTITLE) throw new StudioError("scene_subtitle_too_long", `scene ${index + 1} subtitle is ${subtitle.length} characters`);
  return { title, subtitle: subtitle || null };
}

/**
 * Draws one frame through Python and returns its PNG bytes.
 *
 * The shape of the request is validated before any process starts, so a bad scene list is a named
 * refusal rather than an ffmpeg stack trace.
 */
async function drawFrame(input: {
  out: string;
  width: number;
  height: number;
  title: string;
  subtitle?: string | null;
  base?: string | null;
  logo?: string | null;
  brand?: PromoBrand;
}): Promise<Buffer> {
  const scriptPath = join(process.cwd(), "scripts", "studio", "promo_frame.py");
  const python = process.env.STUDIO_PYTHON ?? "python3";
  const spec = JSON.stringify({
    out: input.out,
    width: input.width,
    height: input.height,
    title: input.title,
    subtitle: input.subtitle ?? "",
    base: input.base ?? null,
    logo: input.logo ?? null,
    brand: input.brand ?? undefined,
  });

  const child = run(python, [scriptPath], {
    timeout: Number(process.env.STUDIO_FRAME_TIMEOUT_MS ?? 60_000),
    maxBuffer: 4 * 1024 * 1024,
  });
  // The spec goes over stdin so a long Arabic title never becomes a shell argument.
  child.child.stdin?.end(spec);
  try {
    await child;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError("frame_failed", message.slice(0, 300));
  }

  const { readFile } = await import("node:fs/promises");
  return readFile(input.out);
}

export async function composePromo(input: ComposePromoInput) {
  const script = String(input.script ?? "").trim();
  if (script.length < MIN_SCRIPT) throw new StudioError("script_too_short", `narration is ${script.length} characters`);
  if (script.length > MAX_SCRIPT) throw new StudioError("script_too_long", `narration is ${script.length} characters`);
  if (!/[\u0621-\u064A]/.test(script)) throw new StudioError("not_arabic", "the narration must contain Arabic");

  if (!Array.isArray(input.scenes) || input.scenes.length === 0) throw new StudioError("no_scenes");
  if (input.scenes.length > MAX_SCENES) throw new StudioError("too_many_scenes");
  const scenes = input.scenes.map(cleanScene);

  const aspect: Aspect = input.aspect ?? "9:16";
  const target = ASPECTS[aspect];
  if (!target) throw new StudioError("invalid_aspect");

  // 1. The voice first: its length sets the film's length.
  const narration = await synthesizeArabic({
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    createdBy: input.createdBy ?? null,
    text: script,
    label: input.label ? `${input.label}:narration` : "tts:narration",
  });

  const spoken = Number(narration.durationSeconds ?? 0);
  if (!Number.isFinite(spoken) || spoken <= 0.2) {
    throw new StudioError("narration_empty", "the narration track has no measurable length");
  }

  // 2. One frame per scene, sized for the chosen aspect, with the logo on every frame.
  const perScene = Math.max(1.2, spoken / scenes.length);
  const frameIds: string[] = [];
  const framePaths: string[] = [];
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const workDirectory = await mkdtemp(join(tmpdir(), "zooka-promo-"));

  try {
    for (const [index, scene] of scenes.entries()) {
      const out = join(workDirectory, `scene-${index + 1}.png`);
      const bytes = await drawFrame({
        out,
        width: target.width,
        height: target.height,
        title: scene.title,
        subtitle: scene.subtitle,
        base: input.backdropPaths?.[index] ?? null,
        logo: input.logoAssetId ? await logoPath(input.organizationId, input.logoAssetId) : null,
        brand: input.brand,
      });
      const stored = await store({
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        createdBy: input.createdBy ?? null,
        mimeType: "image/png",
        bytes,
        label: `promo:scene-${index + 1}`,
      });
      frameIds.push(stored.id);
      framePaths.push(out);
    }

    // 3. The film itself: the measured narration is the clock, so picture and voice end together.
    const produced = await renderVideo({
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      createdBy: input.createdBy ?? null,
      aspect,
      scenes: frameIds.map((assetId, index) => ({
        assetId,
        // The last scene absorbs the rounding remainder so the total matches the voice.
        seconds: index === frameIds.length - 1 ? Number((spoken - perScene * (frameIds.length - 1)).toFixed(2)) : Number(perScene.toFixed(2)),
        transition: "fade" as const,
      })),
      audioAssetId: narration.id,
      label: input.label,
    });

    return { produced, narration, scenes: scenes.length, seconds: spoken, aspect };
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    void framePaths;
  }
}

/** Resolves the logo inside the caller's own workspace, never from a path or a URL. */
async function logoPath(organizationId: string, assetId: string): Promise<string> {
  const { getAsset } = await import("./media");
  const asset = await getAsset(organizationId, assetId);
  if (!asset) throw new StudioError("logo_not_found");
  if (asset.kind !== "image") throw new StudioError("logo_not_image");
  return asset.storagePath;
}
