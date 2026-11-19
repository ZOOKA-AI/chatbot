import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { StudioError } from "@/lib/studio/media";
import { synthesizeArabic, ttsStatus } from "@/lib/studio/tts";

/** Arabic narration, synthesised locally. The status endpoint says plainly whether a voice is wired. */

const Body = z.object({
  text: z.string().min(2).max(1200),
  projectId: z.string().uuid().nullable().optional(),
  label: z.string().max(200).optional(),
});

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  return json({ tts: await ttsStatus() });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  try {
    const asset = await synthesizeArabic({
      organizationId: callerOrganizationId(caller),
      text: parsed.data.text,
      projectId: parsed.data.projectId ?? null,
      label: parsed.data.label ?? null,
      createdBy: caller.userId,
    });
    return json({ asset }, 201);
  } catch (error) {
    if (error instanceof StudioError) return json({ error: error.code, detail: error.detail }, 409);
    return json({ error: "tts_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
