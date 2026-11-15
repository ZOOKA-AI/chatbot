import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
  saveIntegrationConnection,
} from "@/lib/integrations/catalog";

const ADS_API = "https://adsapi.snapchat.com/v1";
const TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token";

export const SNAPCHAT_NOT_CONNECTED =
  "Snapchat is not connected for this workspace. Connect it from Settings → Integrations (paste the Marketing API token, optionally as access_token|refresh_token).";

type Credentials = { accessToken: string; refreshToken: string | null };

/**
 * Snap Marketing API access tokens live one hour. The connect form accepts
 * `access_token` or `access_token|refresh_token`; the refresh half is kept so
 * the token can be renewed with the app credentials instead of expiring.
 */
function splitPastedToken(value: string) {
  const [access, refresh] = value.split("|");
  return {
    accessToken: (access ?? "").trim(),
    refreshToken: refresh?.trim() || null,
  };
}

export async function getSnapchatCredentials(
  workspaceId: string
): Promise<Credentials | null> {
  const tokens = await getIntegrationTokens(workspaceId, "snapchat");
  if (!tokens) {
    return null;
  }
  const stored = typeof tokens.accessToken === "string" ? tokens.accessToken : "";
  const fromField =
    typeof tokens.refreshToken === "string" && tokens.refreshToken
      ? tokens.refreshToken
      : null;
  const split = splitPastedToken(stored);
  if (!split.accessToken) {
    return null;
  }
  return {
    accessToken: split.accessToken,
    refreshToken: fromField ?? split.refreshToken,
  };
}

export function snapTokenParts(value: string) {
  return splitPastedToken(value);
}

async function refreshAccessToken(
  workspaceId: string,
  refreshToken: string
): Promise<string | null> {
  const clientId = process.env.SNAPCHAT_CLIENT_ID ?? process.env.SNAP_CLIENT_ID;
  const clientSecret =
    process.env.SNAPCHAT_CLIENT_SECRET ?? process.env.SNAP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!payload.access_token) {
      return null;
    }
    const nextRefresh = payload.refresh_token ?? refreshToken;
    await saveIntegrationConnection({
      workspaceId,
      providerId: "snapchat",
      tokens: {
        accessToken: payload.access_token,
        refreshToken: nextRefresh,
        tokenType: "bearer",
      },
      scopes: ["snapchat-marketing-api"],
      expiresAt: null,
    });
    return payload.access_token;
  } catch {
    return null;
  }
}

type SnapResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

async function snapGet(workspaceId: string, path: string): Promise<SnapResult> {
  const credentials = await getSnapchatCredentials(workspaceId);
  if (!credentials) {
    return { ok: false, error: SNAPCHAT_NOT_CONNECTED };
  }
  const call = async (token: string) => {
    const response = await fetch(`${ADS_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return response;
  };

  try {
    let response = await call(credentials.accessToken);
    if (response.status === 401 && credentials.refreshToken) {
      const renewed = await refreshAccessToken(workspaceId, credentials.refreshToken);
      if (renewed) {
        response = await call(renewed);
      }
    }
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      const message =
        (typeof payload.debug_message === "string" && payload.debug_message) ||
        (typeof payload.display_message === "string" && payload.display_message) ||
        `Snapchat API returned ${response.status}`;
      await markConnectionError(workspaceId, "snapchat", message);
      return { ok: false, error: message };
    }
    return { ok: true, data: payload };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Snapchat request failed";
    return { ok: false, error: message };
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function getSnapchatOverview(workspaceId: string) {
  const orgs = await snapGet(workspaceId, "/me/organizations");
  if (!orgs.ok) {
    return orgs;
  }
  const orgRows = (orgs.data.organizations as unknown[]) ?? [];
  const organization = orgRows
    .map((row) => (row as { organization?: Record<string, unknown> }).organization)
    .filter((value): value is Record<string, unknown> => Boolean(value))[0];
  if (!organization) {
    return {
      ok: false as const,
      error: "This Snapchat token is not attached to any organization.",
    };
  }
  const organizationId = asString(organization.id);
  const accounts = organizationId
    ? await snapGet(workspaceId, `/organizations/${organizationId}/adaccounts`)
    : null;
  const adAccounts = (
    (accounts && accounts.ok ? (accounts.data.adaccounts as unknown[]) : []) ?? []
  )
    .map((row) => (row as { adaccount?: Record<string, unknown> }).adaccount)
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((account) => ({
      id: asString(account.id),
      name: asString(account.name),
      status: asString(account.status),
      currency: asString(account.currency),
      timezone: asString(account.timezone),
    }));

  return {
    ok: true as const,
    data: {
      organizationId,
      organizationName: asString(organization.name),
      country: asString(organization.country),
      adAccounts,
    },
  };
}

export async function listSnapchatCampaigns(
  workspaceId: string,
  options: { adAccountId?: string; limit?: number } = {}
) {
  const overview = await getSnapchatOverview(workspaceId);
  if (!overview.ok) {
    return overview;
  }
  const adAccounts = overview.data.adAccounts.filter(
    (account) => account.id
  ) as { id: string; name: string | null }[];
  const targets = options.adAccountId
    ? adAccounts.filter((account) => account.id === options.adAccountId)
    : adAccounts.slice(0, 3);
  if (targets.length === 0) {
    return {
      ok: false as const,
      error: options.adAccountId
        ? "That ad account id is not on this Snapchat organization."
        : "This Snapchat organization has no ad accounts.",
    };
  }

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const campaigns: Record<string, unknown>[] = [];
  for (const account of targets) {
    const result = await snapGet(
      workspaceId,
      `/adaccounts/${account.id}/campaigns`
    );
    if (!result.ok) {
      return result;
    }
    for (const row of (result.data.campaigns as unknown[]) ?? []) {
      const campaign = (row as { campaign?: Record<string, unknown> }).campaign;
      if (!campaign) {
        continue;
      }
      campaigns.push({
        id: asString(campaign.id),
        name: asString(campaign.name),
        status: asString(campaign.status),
        objective: asString(campaign.objective),
        startTime: asString(campaign.start_time),
        endTime: asString(campaign.end_time),
        adAccountId: account.id,
        adAccountName: account.name,
      });
    }
  }

  return {
    ok: true as const,
    data: {
      organizationName: overview.data.organizationName,
      total: campaigns.length,
      campaigns: campaigns.slice(0, limit),
    },
  };
}
