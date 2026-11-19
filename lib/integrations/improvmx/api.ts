import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const BASE = "https://api.improvmx.com/v3";

export const IMPROVMX_NOT_CONNECTED =
  "ImprovMX is not connected for this workspace. Connect it from Settings → Integrations with an ImprovMX API key.";

type ImapAlias = { alias: string; forward: string };
type ImapDomain = {
  domain: string;
  display?: string;
  active?: boolean;
  aliases?: ImapAlias[];
};

async function imapGet(workspaceId: string, path: string) {
  const tokens = await getIntegrationTokens(workspaceId, "improvmx");
  const token =
    tokens && typeof tokens.accessToken === "string" ? tokens.accessToken : "";
  if (!token) {
    return { ok: false as const, error: IMPROVMX_NOT_CONNECTED };
  }
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Basic ${token}`,
        Accept: "application/json",
        "User-Agent": "zooka-ai",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) {
      const message = "ImprovMX rejected the API key";
      await markConnectionError(workspaceId, "improvmx", message);
      return { ok: false as const, error: message };
    }
    if (!response.ok) {
      return {
        ok: false as const,
        error: `ImprovMX returned ${response.status}`,
      };
    }
    return {
      ok: true as const,
      data: (await response.json()) as Record<string, unknown>,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "ImprovMX request failed",
    };
  }
}

export async function listEmailDomains(workspaceId: string) {
  const result = await imapGet(workspaceId, "/domains/");
  if (!result.ok) {
    return result;
  }
  const rows = Array.isArray(result.data.domains)
    ? (result.data.domains as ImapDomain[])
    : [];
  return {
    ok: true as const,
    data: {
      count: rows.length,
      domains: rows.map((domain) => ({
        domain: domain.domain,
        active: domain.active ?? null,
        aliasCount: Array.isArray(domain.aliases) ? domain.aliases.length : 0,
        aliases: (domain.aliases ?? []).map((alias) => ({
          alias: alias.alias,
          forward: alias.forward,
        })),
      })),
    },
  };
}

export async function getEmailDomain(workspaceId: string, domain: string) {
  const clean = domain.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
    return { ok: false as const, error: "That does not look like a domain." };
  }
  const result = await imapGet(workspaceId, `/domains/${clean}`);
  if (!result.ok) {
    return result;
  }
  const record = (result.data.domain as ImapDomain | undefined) ?? null;
  if (!record) {
    return { ok: false as const, error: `No ImprovMX domain found for ${clean}.` };
  }
  return {
    ok: true as const,
    data: {
      domain: record.domain,
      active: record.active ?? null,
      aliases: (record.aliases ?? []).map((alias) => ({
        alias: alias.alias,
        forward: alias.forward,
      })),
    },
  };
}
