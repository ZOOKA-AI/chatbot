import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { editAudio, editImage, StudioError, type ImageOperation } from "@/lib/studio/media";

/**
 * Deterministic edits. Each answer is a new asset with its own lineage, so the original is never
 * overwritten and the panel can show what produced what.
 */

const ImageSchema = z.object({
  kind: z.literal("image"),
  assetId: z.string().uuid(),
  operation: z.discriminatedUnion("op", [
    z.object({ op: z.literal("resize"), width: z.number().int(), height: z.number().int() }),
    z.object({
      op: z.literal("crop"),
      width: z.number().int(),
      height: z.number().int(),
      x: z.number().int().min(0),
      y: z.number().int().min(0),
    }),
    z.object({
      op: z.literal("text"),
      text: z.string().min(1).max(120),
      size: z.number().int().optional(),
      color: z.string().max(16).optional(),
      y: z.number().int().optional(),
    }),
    z.object({
      op: z.literal("logo"),
      logoAssetId: z.string().uuid(),
      scale: z.number().optional(),
      corner: z.enum(["tl", "tr", "bl", "br"]).optional(),
    }),
  ]),
});

const AudioSchema = z.object({
  kind: z.literal("audio"),
  assetId: z.string().uuid(),
  op: z.enum(["trim", "gain", "mix"]).optional(),
  start: z.number().min(0).max(3600).optional(),
  seconds: z.number().min(0.5).max(300).optional(),
  gainDb: z.number().min(-40).max(20).optional(),
  voiceoverAssetId: z.string().uuid().nullable().optional(),
});

const Body = z.discriminatedUnion("kind", [ImageSchema, AudioSchema]);

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);

  try {
    if (parsed.data.kind === "image") {
      const asset = await editImage({
        organizationId,
        assetId: parsed.data.assetId,
        operation: parsed.data.operation as ImageOperation,
        createdBy: caller.userId,
      });
      return json({ asset }, 201);
    }
    const asset = await editAudio({
      organizationId,
      assetId: parsed.data.assetId,
      op: parsed.data.op,
      start: parsed.data.start,
      seconds: parsed.data.seconds,
      gainDb: parsed.data.gainDb,
      voiceoverAssetId: parsed.data.voiceoverAssetId ?? null,
      createdBy: caller.userId,
    });
    return json({ asset }, 201);
  } catch (error) {
    if (error instanceof StudioError) {
      const status = error.code === "asset_not_found" ? 404 : error.code === "font_not_configured" ? 409 : 400;
      return json({ error: error.code, detail: error.detail }, status);
    }
    return json({ error: "edit_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
