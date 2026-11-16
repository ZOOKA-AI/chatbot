import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";
import { getAsset, inspect, mediaRoot, StudioError } from "@/lib/studio/media";

const run = promisify(execFile);

/**
 * Background removal, on the customer's own machine, with the licence checked first.
 *
 * The engine is `rembg` (MIT) running a segmentation model on the CPU. The model is the part that
 * matters legally: BRIA's RMBG is strong and is what `rembg` now defaults to, but it is licensed for
 * **non-commercial** use only. So the default here is U2Net, which is Apache-2.0, and the non-commercial
 * model is refused unless an operator explicitly opts in with `STUDIO_ALLOW_NONCOMMERCIAL_MODEL=1`. A
 * refusal names the licence, because silently shipping a non-commercial model into a paid product is
 * exactly the kind of mistake that is invisible until it is expensive.
 */

export const SEGMENTATION_MODELS = {
  u2net: {
    license: "Apache-2.0",
    commercial: true,
    note: "general-purpose salient object segmentation, ~176 MB",
  },
  "isnet-general-use": {
    license: "Apache-2.0",
    commercial: true,
    note: "sharper edges on hair and thin structures",
  },
  "bria-rmbg": {
    license: "CC-BY-NC-4.0",
    commercial: false,
    note: "best quality, but non-commercial only; requires a BRIA licence to use commercially",
  },
} as const;

export type SegmentationModel = keyof typeof SEGMENTATION_MODELS;

function pythonBinary(): string {
  return process.env.STUDIO_PYTHON ?? "python3";
}

let engineCache: { ready: boolean; detail: string } | null = null;

/** Whether the engine is installed, checked once per process and reported honestly when absent. */
export async function backgroundEngineStatus(): Promise<{ ready: boolean; detail: string }> {
  if (engineCache) return engineCache;
  try {
    const { stdout } = await run(pythonBinary(), ["-c", "import rembg, PIL; print('ok')"], { timeout: 60_000 });
    engineCache = { ready: stdout.trim() === "ok", detail: "rembg (MIT) with U2Net (Apache-2.0)" };
  } catch {
    engineCache = {
      ready: false,
      detail: "install the engine with `pip install rembg onnxruntime pillow`",
    };
  }
  return engineCache;
}

export function resolveModel(requested?: string | null): SegmentationModel {
  const name = (requested ?? process.env.STUDIO_SEGMENTATION_MODEL ?? "u2net") as SegmentationModel;
  const entry = SEGMENTATION_MODELS[name];
  if (!entry) throw new StudioError("unknown_model", name);
  if (!entry.commercial && process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL !== "1") {
    throw new StudioError("license_not_commercial", `${name} is ${entry.license}`);
  }
  return name;
}

/**
 * Removes the background and keeps the transparency.
 *
 * The result is a PNG with a real alpha channel, written through the same tenant-scoped store as any
 * other derivative, with the model and its licence recorded in `operation` so the customer (and an
 * auditor) can see what produced the cutout.
 */
export async function removeBackground(input: {
  organizationId: string;
  assetId: string;
  model?: string | null;
  createdBy?: string | null;
  projectId?: string | null;
}) {
  const source = await getAsset(input.organizationId, input.assetId);
  if (!source) throw new StudioError("asset_not_found");
  if (source.kind !== "image") throw new StudioError("not_an_image");

  const engine = await backgroundEngineStatus();
  if (!engine.ready) throw new StudioError("engine_missing", engine.detail);
  const model = resolveModel(input.model);

  const outId = randomUUID();
  const directory = join(mediaRoot(), input.organizationId);
  await mkdir(directory, { recursive: true });
  const outPath = join(directory, `${outId}.png`);

  const script = join(process.cwd(), "scripts/studio/remove_bg.py");
  try {
    await run(pythonBinary(), [script, source.storagePath, outPath, model], {
      timeout: Number(process.env.STUDIO_BG_TIMEOUT_MS ?? 180_000),
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, REMBG_MODEL: model },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError("background_failed", message.slice(0, 300));
  }

  // The alpha channel is the proof: a cutout with no transparency is just a re-encode.
  const probe = await run(pythonBinary(), [
    "-c",
    "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGBA'); px=im.load(); print(im.mode, px[0,0][3], px[im.size[0]//2, im.size[1]//2][3])",
    outPath,
  ]);
  const [mode, cornerAlpha, centreAlpha] = probe.stdout.trim().split(/\s+/);
  if (mode !== "RGBA" || Number(cornerAlpha) > 40) {
    throw new StudioError("no_transparency", `corner alpha ${cornerAlpha}`);
  }

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
      operation: {
        op: "background_remove",
        model,
        license: SEGMENTATION_MODELS[model].license,
        engine: "rembg",
        engineLicense: "MIT",
        cornerAlpha: Number(cornerAlpha),
        centreAlpha: Number(centreAlpha),
      },
      parentAssetId: source.id,
      label: "edit:background_remove",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

/** Reads the alpha coverage of an asset, which is how the panel can show a cutout honestly. */
export async function alphaCoverage(path: string): Promise<number | null> {
  try {
    const { stdout } = await run(pythonBinary(), [
      "-c",
      "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGBA'); a=im.getchannel('A'); h=a.histogram(); total=sum(h); print(round(sum(h[1:])/total, 4) if total else 0)",
      path,
    ]);
    return Number(stdout.trim());
  } catch {
    return null;
  }
}

/** Writes bytes to a temporary path, for engines that insist on a file rather than a buffer. */
export async function writeTemp(bytes: Buffer, extension: string): Promise<string> {
  const directory = join(mediaRoot(), "_tmp");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${randomUUID()}${extension}`);
  await writeFile(path, bytes);
  return path;
}

export async function readFileBytes(path: string): Promise<Buffer> {
  return readFile(path);
}
