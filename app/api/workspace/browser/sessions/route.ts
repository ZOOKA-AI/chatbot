import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { createSession, expireDueSessions, listSessions } from "@/lib/browser/sessions";

/**
 * Listing and creating browser sessions.
 *
 * A session is created in the caller's own workspace, full stop: the organization is taken from the
 * authenticated caller and is not accepted from the body. The start URL is stored, not fetched, so
 * creating a session cannot be used to probe an internal address; the URL policy runs when the
 * session actually starts.
 */

const CreateSchema = z.object({
  projectId: z.string().uuid().optional(),
  startUrl: z.string().url().max(2048).optional(),
  ttlMinutes: z.number().int().min(5).max(180).optional(),
});

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  await expireDueSessions(callerOrganizationId(caller));
  const sessions = await listSessions(callerOrganizationId(caller), 20);
  return json({ sessions });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);

  const session = await createSession({
    organizationId: callerOrganizationId(caller),
    ownerId: caller.userId,
    projectId: parsed.data.projectId ?? null,
    startUrl: parsed.data.startUrl ?? null,
    ttlMinutes: parsed.data.ttlMinutes,
  });
  return json({ session }, 201);
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
