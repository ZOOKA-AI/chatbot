import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { getSession } from "@/lib/browser/sessions";
import { browserRuntime } from "@/lib/browser/runtime";
import { ensureLiveBrowser } from "@/lib/browser/resume";

/**
 * A fresh frame of the live session.
 *
 * This is what "live view" honestly means here: a real screenshot taken from the running browser at
 * request time, not a stored picture replayed and not a simulated cursor. When no browser is
 * attached the route says so instead of serving an old frame, so the interface cannot show a live
 * session that has ended.
 */

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);
  const { id } = await context.params;

  const session = await getSession(organizationId, id);
  if (!session) return json({ error: "not_found" }, 404);
  const resumed = await ensureLiveBrowser({
    sessionId: id,
    organizationId,
    preferredUrl: session.currentUrl ?? undefined,
  });
  if (resumed.ok === false) {
    return json({ error: "no_live_browser", reason: resumed.code }, 409);
  }

  const frame = await browserRuntime().screenshot(id, organizationId, "live");
  if (frame.ok === false) return json({ error: "frame_unavailable", reason: frame.code }, 409);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(frame.path);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}

export const GET = withCommanderTenant(GETHandler);
