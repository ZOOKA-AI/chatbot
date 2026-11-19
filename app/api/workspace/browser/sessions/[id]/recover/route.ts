import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { BrowserControlError, recoverSession, type Caller } from "@/lib/browser/sessions";

/**
 * Bring a session back after its browser died.
 *
 * The customer asks for recovery explicitly; nothing relaunches behind their back. A second request
 * while a recovery is running is refused with a distinct code rather than starting a second browser.
 */

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const { id } = await context.params;
  const scoped: Caller = { userId: caller.userId, organizationId: callerOrganizationId(caller), role: caller.role };

  try {
    const result = await recoverSession({ caller: scoped, sessionId: id });
    return json({ session: result.session, navigatedTo: result.navigatedTo });
  } catch (error) {
    if (error instanceof BrowserControlError) {
      const status = error.code === "session_not_found" ? 404 : error.code === "not_session_owner" ? 403 : 409;
      return json({ error: error.code }, status);
    }
    return json({ error: "recovery_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
