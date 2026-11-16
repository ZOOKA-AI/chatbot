import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { backgroundEngineStatus, removeBackground, SEGMENTATION_MODELS } from "@/lib/studio/background";
import { StudioError } from "@/lib/studio/media";

/**
 * A cutout, with the licence of the model that made it.
 *
 * The model name is validated against an allowlist that carries each model's licence, so a request can
 * never select a non-commercial model by name alone, and the response states the licence that was used.
 */

const Body = z.object({
  assetId: z.string().uuid(),
  model: z.enum(Object.keys(SEGMENTATION_MODELS) as [keyof typeof SEGMENTATION_MODELS, ...Array<keyof typeof SEGMENTATION_MODELS>]).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const engine = await backgroundEngineStatus();
  return json({
    engine,
    models: Object.entries(SEGMENTATION_MODELS).map(([id, meta]) => ({ id, ...meta })),
    allowNonCommercial: process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL === "1",
  });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  try {
    const asset = await removeBackground({
      organizationId: callerOrganizationId(caller),
      assetId: parsed.data.assetId,
      model: parsed.data.model ?? null,
      projectId: parsed.data.projectId ?? null,
      createdBy: caller.userId,
    });
    return json({ asset }, 201);
  } catch (error) {
    if (error instanceof StudioError) {
      const status = error.code === "asset_not_found" ? 404 : error.code === "license_not_commercial" ? 403 : 409;
      return json({ error: error.code, detail: error.detail }, status);
    }
    return json({ error: "background_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
