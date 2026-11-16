import { readFile } from "node:fs/promises";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { listEvidence } from "@/lib/browser/sessions";

/**
 * A stored screenshot, served only to its own workspace.
 *
 * The file path is never taken from the request: it is looked up among the evidence rows of this
 * session in this workspace, so a crafted id cannot read an arbitrary file. Another workspace's
 * evidence id is a 404, the same answer as an id that does not exist.
 */

async function GETHandler(request: Request, context: { params: Promise<{ id: string; evidenceId: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);
  const { id, evidenceId } = await context.params;

  const rows = await listEvidence(organizationId, id, 100);
  const row = rows.find((candidate) => candidate.id === evidenceId);
  if (!row) return json({ error: "not_found" }, 404);

  try {
    const bytes = await readFile(row.path);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
    });
  } catch {
    return json({ error: "evidence_missing" }, 404);
  }
}

export const GET = withCommanderTenant(GETHandler);
