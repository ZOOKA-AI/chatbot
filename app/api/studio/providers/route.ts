import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { providerStatuses } from "@/lib/studio/providers";

/**
 * What generation is actually reachable right now.
 *
 * The panel renders this list instead of a hard-coded story about what the studio can do, so a
 * provider that is missing shows its exact blocker rather than a button that fails on click.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  void callerOrganizationId(caller);
  const providers = await providerStatuses();
  return json({ providers });
}

export const GET = withCommanderTenant(GETHandler);
