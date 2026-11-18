import "server-only";

import { listWorkspaceIntegrations } from "@/lib/integrations/catalog";
import { getConnectorSpec } from "@/lib/integrations/connectors/registry";
import { isProbeable } from "@/lib/integrations/connectors/probeable";
import { TOKEN_PROVIDERS, isTokenProviderId } from "@/lib/integrations/token-providers";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

/**
 * What the settings page may honestly say about one integration.
 *
 * Three separate things were being conflated before: what we stored, what the
 * provider allows, and what the provider actually answered. This module collects
 * the first two (a read-only database row plus the connector's declared
 * operations and scopes) and leaves the third to probe.ts, which makes the call.
 */
export type ConnectorDetail = {
  providerId: string;
  /** Label the provider gave this account, or null when nothing is stored. */
  account: string | null;
  accountEmail: string | null;
  status: "connected" | "expired" | "error" | "revoked" | "none";
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  /** The reads this connector can really perform today. Writes are never listed. */
  operations: { id: string; titleAr: string; titleEn: string }[];
  docsUrl: string | null;
  blockers: string[];
  /** Why writes are absent, in the connector's own words. */
  writeStatus: string | null;
};

function toIso(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

/** A stored column can be a JSON string; the card must not call .join on it. */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

export async function getConnectorDetails(
  workspaceId: string
): Promise<Map<string, ConnectorDetail>> {
  try {
    return await buildDetails(workspaceId);
  } catch {
    // The page is a settings screen, not a report: a failure here costs the
    // detail lines, never the whole page.
    return new Map<string, ConnectorDetail>();
  }
}

async function buildDetails(
  workspaceId: string
): Promise<Map<string, ConnectorDetail>> {
  const details = new Map<string, ConnectorDetail>();

  let rows: Awaited<ReturnType<typeof listWorkspaceIntegrations>> = [];
  try {
    rows = await listWorkspaceIntegrations(workspaceId);
  } catch {
    // A failed read must not take the page down; the cards simply show no account.
    rows = [];
  }

  for (const row of rows) {
    const spec = getConnectorSpec(row.providerId);
    const tokenDefinition = isTokenProviderId(row.providerId)
      ? TOKEN_PROVIDERS[row.providerId]
      : null;

    details.set(row.providerId, {
      providerId: row.providerId,
      account: row.displayName ?? null,
      accountEmail: row.accountEmail ?? null,
      status: row.status,
      scopes: toStringArray(spec?.scopes ?? tokenDefinition?.scopes ?? row.scopes),
      expiresAt: toIso(row.expiresAt),
      lastUsedAt: toIso(row.lastUsedAt),
      lastError: row.lastError ?? null,
      operations: (spec?.operations ?? [])
        .filter((operation) => operation.kind === "read")
        .map((operation) => ({
          id: operation.id,
          titleAr: operation.titleAr,
          titleEn: operation.titleEn,
        })),
      docsUrl: spec?.docsUrl ?? tokenDefinition?.docsUrl ?? null,
      blockers: spec?.blockers ?? [],
      writeStatus: spec?.writeStatus ?? null,
    });
  }

  // A card for a provider that has a real call path but nothing stored still
  // needs its block: it is the only place the user can see "no account stored"
  // and press a test that answers not_connected instead of a blank card.
  for (const provider of INTEGRATION_PROVIDERS) {
    if (details.has(provider.id) || !isProbeable(provider.id)) {
      continue;
    }
    const spec = getConnectorSpec(provider.id);
    const tokenDefinition = isTokenProviderId(provider.id)
      ? TOKEN_PROVIDERS[provider.id]
      : null;
    details.set(provider.id, {
      providerId: provider.id,
      account: null,
      accountEmail: null,
      status: "none",
      scopes: toStringArray(spec?.scopes ?? tokenDefinition?.scopes),
      expiresAt: null,
      lastUsedAt: null,
      lastError: null,
      operations: (spec?.operations ?? [])
        .filter((operation) => operation.kind === "read")
        .map((operation) => ({
          id: operation.id,
          titleAr: operation.titleAr,
          titleEn: operation.titleEn,
        })),
      docsUrl: spec?.docsUrl ?? tokenDefinition?.docsUrl ?? null,
      blockers: spec?.blockers ?? [],
      writeStatus: spec?.writeStatus ?? null,
    });
  }

  return details;
}
