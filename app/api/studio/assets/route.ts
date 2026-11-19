import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { assertQuota, listAssets, store, StudioError, usage } from "@/lib/studio/media";

/**
 * Uploading and listing the customer's media.
 *
 * The workspace comes from the caller, never from the form. The declared content type must be one we
 * can actually handle, the size is checked against the kind's limit and against the workspace quota,
 * and the file is measured with ffprobe after it lands, so a renamed file cannot pose as something
 * else and a broken file is recorded as failed instead of appearing usable.
 */

const MAX_TOTAL = 220 * 1024 * 1024;

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const [assets, used] = await Promise.all([
    listAssets(organizationId, { projectId, limit: 60 }),
    usage(organizationId),
  ]);
  return json({ assets, usage: used });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "invalid_form" }, 400);

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file_required" }, 400);
  if (file.size > MAX_TOTAL) return json({ error: "file_too_large" }, 413);

  const parsedProject = z.string().uuid().safeParse(form.get("projectId"));
  const projectId = parsedProject.success ? parsedProject.data : null;
  const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 200) : null;

  try {
    await assertQuota(organizationId, file.size);
    const asset = await store({
      organizationId,
      projectId,
      createdBy: caller.userId,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
      label,
    });
    return json({ asset }, 201);
  } catch (error) {
    if (error instanceof StudioError) {
      const status = error.code === "file_too_large" ? 413 : error.code === "quota_exceeded" ? 429 : 400;
      return json({ error: error.code, detail: error.detail }, status);
    }
    return json({ error: "upload_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
