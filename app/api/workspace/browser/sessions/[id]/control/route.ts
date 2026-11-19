import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { BrowserControlError, controlSession, type Caller, type ControlAction } from "@/lib/browser/sessions";

/**
 * Every control action, authorized on the server.
 *
 * The route contributes only the caller's identity; whether this person may pause, take over or stop
 * this session is decided against the stored row. A UI that hides a button is a courtesy, not a
 * permission, and this handler does not rely on one.
 */

const ControlSchema = z.object({
  action: z.enum(["start", "pause", "resume", "take_over", "return_control", "stop"]),
});

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const parsed = ControlSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_action" }, 400);

  const { id } = await context.params;
  const scoped: Caller = {
    userId: caller.userId,
    organizationId: callerOrganizationId(caller),
    role: caller.role,
  };

  try {
    const result = await controlSession({ caller: scoped, sessionId: id, action: parsed.data.action as ControlAction });
    return json({ session: result.session, events: result.events });
  } catch (error) {
    if (error instanceof BrowserControlError) {
      const status = error.code === "session_not_found" ? 404 : error.code === "not_session_owner" ? 403 : 409;
      return json({ error: error.code }, status);
    }
    return json({ error: "control_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
