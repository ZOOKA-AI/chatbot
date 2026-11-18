import "server-only";

import { getConnectorSpec } from "@/lib/integrations/connectors/registry";
import { isOAuthProviderId } from "@/lib/integrations/oauth/config";
import { isTokenProviderId } from "@/lib/integrations/token-providers";

/**
 * Which providers have a real call path, kept in its own module on purpose.
 *
 * The settings page needs this answer while it renders, and asking probe.ts for
 * it dragged the executor, the n8n client and the Google health check into the
 * page's server graph for a boolean. This module imports only the lookup tables,
 * so a page render never depends on a provider client it does not call.
 */
const GOOGLE_PROVIDERS = ["google_drive", "gmail", "google_calendar"] as const;

export function isProbeable(providerId: string): boolean {
  if (getConnectorSpec(providerId)) return true;
  if ((GOOGLE_PROVIDERS as readonly string[]).includes(providerId)) return true;
  if (isOAuthProviderId(providerId)) return true;
  if (isTokenProviderId(providerId)) return true;
  return providerId === "n8n";
}
