import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { getSession, listEvents, listEvidence } from "@/lib/browser/sessions";
import { browserRuntime } from "@/lib/browser/runtime";

/**
 * One session, with the timeline and the screenshots that prove it happened.
 *
 * The read is filtered by the caller's workspace, so another workspace's id answers 404 exactly like
 * an id that never existed. `runtime` is reported honestly: whether a live browser is attached right
 * now, and which Chromium build is running, so the interface cannot imply a live view it does not have.
 */

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);
  const { id } = await context.params;

  const session = await getSession(organizationId, id);
  if (!session) return json({ error: "not_found" }, 404);

  const [events, evidence] = await Promise.all([
    listEvents(organizationId, id, 100),
    listEvidence(organizationId, id, 20),
  ]);

  const health = browserRuntime().health(id, organizationId);
  const active = ["ready", "running", "paused", "taken_over", "starting"].includes(session.status);

  return json({
    session,
    events,
    evidence,
    runtime: {
      live: health.live,
      // A session that claims to be active with no browser attached is reported as broken, and the
      // panel offers recovery instead of showing a still frame from before the crash.
      broken: active && !health.live,
      crashedReason: health.crashed,
      engine: browserRuntime().version(),
    },
  });
}

export const GET = withCommanderTenant(GETHandler);
