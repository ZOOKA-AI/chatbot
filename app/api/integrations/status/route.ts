import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { isGoogleDriveConfigured } from "@/lib/integrations/google-drive/server";
import { getLiveIntegrationStatus } from "@/lib/integrations/live-status";

/**
 * Lightweight read-only answer to "which integrations does this workspace
 * actually have connected?" for UI that is not a server component, such as the
 * studio integration cards. Read-only: it never starts an OAuth flow.
 *
 * `connected` only lists credentials that work right now; anything that was
 * connected but must be re-authorised is reported in `needsReconnect`.
 */
export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { connected: [], needsReconnect: [] },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const status = await getLiveIntegrationStatus(context.organizationId, {
    googleConfigured: isGoogleDriveConfigured(),
  });

  return NextResponse.json(
    {
      connected: [...status.connected],
      needsReconnect: [...status.needsReconnect],
    },
    { headers: { "cache-control": "no-store" } }
  );
}
