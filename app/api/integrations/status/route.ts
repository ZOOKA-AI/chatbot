import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { getGoogleAuthorizedProviders } from "@/lib/integrations/google-drive/server";

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
    for (const provider of await getGoogleAuthorizedProviders(
      context.organizationId
    )) {
      connected.add(provider);
    }
  } catch {
    // A degraded read should only hide the badge, never break the page.
  }

  try {
    for (const stored of await listWorkspaceIntegrations(
      context.organizationId
    )) {
      if (
        stored.status === "connected" &&
        !["google_drive", "gmail", "google_calendar"].includes(
          stored.providerId
        )
      ) {
        connected.add(stored.providerId);
      }
    }
  } catch {
    // Same: badge falls back to whatever Google reported above.
  }

  return NextResponse.json({ connected: [...connected] });
}
