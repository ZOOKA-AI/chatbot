import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { isGoogleDriveConnected } from "@/lib/integrations/google-drive/server";

/**
 * Lightweight read-only answer to "which integrations does this workspace
 * actually have connected?" for UI that is not a server component, such as the
 * studio integration cards. Read-only: it never starts an OAuth flow.
 */
export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ connected: [] }, { status: 401 });
  }

  const connected = new Set<string>();

  try {
    if (await isGoogleDriveConnected(context.organizationId)) {
      connected.add("google_drive");
      // The Google grant covers Gmail read/send on the same connection.
      connected.add("gmail");
    }
  } catch {
    // A degraded read should only hide the badge, never break the page.
  }

  try {
    for (const stored of await listWorkspaceIntegrations(
      context.organizationId,
    )) {
      if (stored.status === "connected") {
        connected.add(stored.providerId);
      }
    }
  } catch {
    // Same: badge falls back to whatever Google reported above.
  }

  return NextResponse.json({ connected: [...connected] });
}
