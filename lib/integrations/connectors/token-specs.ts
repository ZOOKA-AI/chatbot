import "server-only";

import { buildHeaders } from "@/lib/integrations/connectors/auth";
import { CONNECTOR_SPECS } from "@/lib/integrations/connectors/registry";
import type { TokenProviderDefinition } from "@/lib/integrations/token-providers";

/**
 * Bridges the declarative connector specs into the existing secure connect
 * card. Each provider here is validated against the real account before the
 * encrypted credential is stored, so a pasted string is never trusted on faith.
 * Providers with no token route (Namecheap, blocked by its IP allowlist) are
 * intentionally absent: a card that cannot succeed would be a lie.
 */
const TOKEN_CAPABLE = [
  "slack",
  "notion",
  "twilio",
  "shopify",
  "tiktok",
  "whatsapp",
  "x",
  "cloudflare",
  "meta_ads",
  "tiktok_ads",
  "snapchat_ads",
  "linkedin_ads",
  "pinterest_ads",
  "reddit_ads",
  "amazon_ads",
  "x_ads",
  "hubspot",
  "airtable",
] as const;

export type ConnectorTokenProviderId = (typeof TOKEN_CAPABLE)[number];

export const CONNECTOR_TOKEN_PROVIDERS = Object.fromEntries(
  TOKEN_CAPABLE.map((id) => {
    const spec = CONNECTOR_SPECS.find((entry) => entry.providerId === id);
    if (!spec) {
      throw new Error(`connector spec missing for ${id}`);
    }
    const definition: TokenProviderDefinition = {
      id,
      label: spec.label,
      tokenHint: spec.credentialHintEn,
      validateUrl: (token) => spec.verify.url(spec.parse(token)),
      validateMethod: spec.verify.method,
      auth: (token) => buildHeaders(spec, spec.parse(token)),
      describe: spec.describe,
      scopes: spec.scopes,
      docsUrl: spec.docsUrl,
    };
    return [id, definition];
  })
) as Record<ConnectorTokenProviderId, TokenProviderDefinition>;
