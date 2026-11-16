import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { renderVideo, StudioError, type Aspect } from "@/lib/studio/media";

/**
 * A real MP4, rendered here with ffmpeg.
 *
 * No provider is involved, so there is nothing to authorise and nothing to charge. The output is
 * probed before the row is written; if ffprobe cannot read it the request fails rather than handing
 * the customer a broken file with a success message.
 */

const Body = z.object({
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  scenes: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        seconds: z.number().min(0.5).max(30),
        title: z.string().max(80).nullable().optional(),
        transition: z.enum(["cut", "fade"]).optional(),
      })
    )
    .min(1)
    .max(12),
  audioAssetId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  label: z.string().max(200).optional(),
});

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);

  try {
    const asset = await renderVideo({
      organizationId: callerOrganizationId(caller),
      projectId: parsed.data.projectId ?? null,
      createdBy: caller.userId,
      aspect: parsed.data.aspect as Aspect,
      scenes: parsed.data.scenes,
      audioAssetId: parsed.data.audioAssetId ?? null,
      label: parsed.data.label ?? null,
    });
    return json({ asset }, 201);
  } catch (error) {
    if (error instanceof StudioError) {
      const status = error.code === "asset_not_found" ? 404 : 400;
      return json({ error: error.code, detail: error.detail }, status);
    }
    return json({ error: "render_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
