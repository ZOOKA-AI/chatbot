import type { OAuthTokenBundle } from "@/lib/integrations/oauth/store";

interface XTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
}

export async function refreshXTokenBundle(
  tokens: OAuthTokenBundle,
  config: { clientId: string; clientSecret: string },
  fetcher: typeof fetch = fetch
): Promise<{ tokens: OAuthTokenBundle; expiresAt: Date } | null> {
  if (!tokens.refreshToken) {
    return null;
  }
  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    const response = await fetcher("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const result = (await response.json()) as XTokenResponse;
    if (
      typeof result.access_token !== "string" ||
      result.access_token.length === 0 ||
      typeof result.expires_in !== "number" ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0
    ) {
      return null;
    }
    const refreshed: OAuthTokenBundle = {
      accessToken: result.access_token,
      refreshToken:
        typeof result.refresh_token === "string"
          ? result.refresh_token
          : tokens.refreshToken,
      tokenType:
        typeof result.token_type === "string"
          ? result.token_type
          : tokens.tokenType,
      scope: typeof result.scope === "string" ? result.scope : tokens.scope,
    };
    return {
      tokens: refreshed,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
    };
  } catch {
    return null;
  }
}
