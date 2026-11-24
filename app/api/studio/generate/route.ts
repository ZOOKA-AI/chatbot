import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { providerStatuses, providerRegistry } from "@/lib/studio/providers";
import { selectEngine } from "@/lib/studio/engine-policy";
import { assertQuota, store, StudioError } from "@/lib/studio/media";
import { finishMediaJob, reserveFreeImage } from "@/lib/db/queries";
import { dailyImageLimit } from "@/lib/media/free-image";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

/**
 * Generation, only through a provider that answered its health check.
 *
 * If nothing is ready this returns 409 with the blockers rather than pretending to work, and it never
 * falls back to a stock image. A real provider's bytes are stored through the same tenant-scoped media
 * layer as an upload, so the same isolation rules apply to generated output.
 */

const Body = z.object({
  prompt: z.string().min(4).max(2000),
  capability: z.enum(["image", "video", "audio"]).default("image"),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
});

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  // The policy decides before any provider is contacted: a paid engine cannot be selected without
  // an enabled switch and a cited approval, and the local editor is never offered as a generator.
  const decision = selectEngine({
    capability: "image_generate",
    approvalReference: typeof request.headers.get("x-studio-approval") === "string" ? request.headers.get("x-studio-approval") : null,
  });
  if (!decision.chosen) {
    return json({ error: "no_engine_for_generation", reason: decision.reason, refused: decision.refused }, 409);
  }

  const statuses = await providerStatuses();
  // "Ready" is not enough: the local provider is ready and cannot generate. Only a generative
  // provider that answered its health check may be chosen, otherwise the answer is the blocker list.
  const ready = providerRegistry().find(
    (provider) =>
      provider.generative &&
      statuses.some((status) => status.provider === provider.id && status.ready) &&
      provider.capabilities.includes(parsed.data.capability)
  );
  if (!ready) {
    return json(
      {
        error: "no_provider_ready",
        blockers: statuses.map((status) => (status.ready ? `${status.provider}:ready` : `${status.provider}:${status.blocked}`)),
      },
      409
    );
  }

  // Free tiers share one allowance across every workspace, so each workspace gets a daily cap by plan.
  let freeJobId: string | null = null;
  if (ready.kind === "free_api") {
    const entitlements = await getWorkspaceEntitlements(organizationId);
    const limit = dailyImageLimit(entitlements.plan);
    const reservation = await reserveFreeImage({ organizationId, prompt: parsed.data.prompt, dailyLimit: limit });
    if (!reservation.job) {
      return json({ error: "daily_image_limit", limit, plan: entitlements.plan }, 429);
    }
    freeJobId = reservation.job.id;
  }

  const result = await ready.generate({
    organizationId,
    prompt: parsed.data.prompt,
    capability: parsed.data.capability,
    size: parsed.data.width && parsed.data.height ? { width: parsed.data.width, height: parsed.data.height } : undefined,
  });

  if (result.ok === false) {
    if (freeJobId) {
      await finishMediaJob({ id: freeJobId, status: "failed", error: `${result.provider}:${result.code}` }).catch(() => null);
    }
    return json({ error: result.code, provider: result.provider, detail: result.detail }, 502);
  }

  try {
    await assertQuota(organizationId, result.bytes.length);
    const asset = await store({
      organizationId,
      projectId: null,
      createdBy: caller.userId,
      mimeType: result.mimeType,
      bytes: result.bytes,
      label: `generated:${result.provider}`,
    });
    if (freeJobId) {
      await finishMediaJob({ id: freeJobId, status: "succeeded", assetUrl: `/api/studio/assets/${asset.id}/file` }).catch(() => null);
    }
    // The bytes come back too: studio files live on the instance's disk, and the picture the customer
    // just paid nothing for should show even if the next request lands on another instance.
    const preview = result.bytes.length <= 4 * 1024 * 1024 ? `data:${result.mimeType};base64,${result.bytes.toString("base64")}` : null;
    return json({ asset, provider: result.provider, seconds: result.seconds, meta: result.meta, preview }, 201);
  } catch (error) {
    if (freeJobId) {
      await finishMediaJob({ id: freeJobId, status: "failed", error: "store" }).catch(() => null);
    }
    if (error instanceof StudioError) return json({ error: error.code, detail: error.detail }, 400);
    return json({ error: "store_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
