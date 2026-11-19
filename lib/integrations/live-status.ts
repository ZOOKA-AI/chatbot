import "server-only";

import { listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { getGoogleConnectionHealth } from "@/lib/integrations/google-drive/server";
import { isOAuthProviderId } from "@/lib/integrations/oauth/config";
import { getOAuthConnection } from "@/lib/integrations/oauth/store";

const GOOGLE_PROVIDERS = ["google_drive", "gmail", "google_calendar"];

export type LiveIntegrationStatus = {
  /** Providers whose stored credential is present and usable right now. */
  connected: Set<string>;
  /** Providers that were connected once but must be re-authorised. */
  needsReconnect: Set<string>;
};

/**
 * Single source of truth for "is this integration connected?".
 *
 * Every surface (settings page, studio cards, status API) must agree, and a
 * badge may only read "connected" when the credential actually works:
 * - Google: the granted scopes AND a successful token refresh.
 * - GitHub / Vercel: the OAuth connection the agent tools read, not a legacy
 *   catalog row that can drift out of sync.
 * - Others (Stripe, Supabase, n8n): the encrypted workspace credential.
 *
 * Read-only and failure tolerant: a degraded read hides a badge, it never
 * breaks the page or reports a false "connected".
 */
export async function getLiveIntegrationStatus(
  organizationId: string,
  options: { googleConfigured?: boolean } = {}
): Promise<LiveIntegrationStatus> {
  const connected = new Set<string>();
  const needsReconnect = new Set<string>();

  if (options.googleConfigured !== false) {
    try {
      const google = await getGoogleConnectionHealth(organizationId);
      for (const provider of google.providers) {
        (google.usable ? connected : needsReconnect).add(provider);
      }
    } catch {
      // Unknown state: show neither badge rather than a wrong one.
    }
  }

  let stored: Awaited<ReturnType<typeof listWorkspaceIntegrations>> = [];
  try {
    stored = await listWorkspaceIntegrations(organizationId);
  } catch {
    stored = [];
  }

  await Promise.all(
    stored.map(async (item) => {
      if (GOOGLE_PROVIDERS.includes(item.providerId)) {
        return;
      }
      if (isOAuthProviderId(item.providerId)) {
        // The catalog row alone is not proof: confirm the live OAuth record.
        const connection = await getOAuthConnection(
          organizationId,
          item.providerId
        );
        if (connection) {
          connected.add(item.providerId);
        } else if (item.status === "connected") {
          needsReconnect.add(item.providerId);
        }
        return;
      }
      if (item.status === "connected") {
        connected.add(item.providerId);
      } else if (item.status === "expired" || item.status === "revoked") {
        needsReconnect.add(item.providerId);
      }
    })
  );

  // An OAuth connection can exist without a catalog row (connected through
  // the GitHub/Vercel card): include it so the badges match that card.
  for (const provider of ["github", "vercel", "x"] as const) {
    if (connected.has(provider) || needsReconnect.has(provider)) {
      continue;
    }
    if (await getOAuthConnection(organizationId, provider)) {
      connected.add(provider);
    }
  }

  return { connected, needsReconnect };
}
