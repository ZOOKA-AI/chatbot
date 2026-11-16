import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { providerStatuses, providerRegistry } from "@/lib/studio/providers";
import { assertQuota, store, StudioError } from "@/lib/studio/media";

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

  const result = await ready.generate({
    organizationId,
    prompt: parsed.data.prompt,
    capability: parsed.data.capability,
    size: parsed.data.width && parsed.data.height ? { width: parsed.data.width, height: parsed.data.height } : undefined,
  });

  if (result.ok === false) {
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
    return json({ asset, provider: result.provider, seconds: result.seconds, meta: result.meta }, 201);
  } catch (error) {
    if (error instanceof StudioError) return json({ error: error.code, detail: error.detail }, 400);
    return json({ error: "store_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
