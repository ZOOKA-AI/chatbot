import "server-only";

export type OAuthProviderId = "github" | "vercel";

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scopes: string[];
  /** Some providers (Vercel) refuse an unknown scope parameter. */
  sendScope: boolean;
  /** Returns the stable account id and a human name from the user payload. */
  describeAccount: (payload: Record<string, unknown>) => {
    accountId: string | null;
    accountName: string | null;
    avatarUrl: string | null;
  };
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderDefinition> =
  {
    github: {
      id: "github",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userUrl: "https://api.github.com/user",
      scopes: ["repo", "read:user"],
      sendScope: true,
      describeAccount: (payload) => {
        const login = typeof payload.login === "string" ? payload.login : null;
        const name = typeof payload.name === "string" ? payload.name : null;
        const avatar =
          typeof payload.avatar_url === "string" ? payload.avatar_url : null;
        return {
          accountId: login,
          accountName: name ?? login,
          avatarUrl: avatar,
        };
      },
    },
    vercel: {
      id: "vercel",
      authorizeUrl: "https://vercel.com/oauth/authorize",
      tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
      userUrl: "https://api.vercel.com/v2/user",
      // Vercel integration scopes are declared on the integration itself.
      scopes: [],
      sendScope: false,
      describeAccount: (payload) => {
        const user = (payload.user ?? payload) as Record<string, unknown>;
        const id =
          typeof user.id === "string" || typeof user.id === "number"
            ? String(user.id)
            : null;
        const candidates = [user.name, user.username, user.email];
        const name =
          candidates.find(
            (value): value is string =>
              typeof value === "string" && value !== ""
          ) ?? null;
        const avatarValue =
          typeof user.avatar === "string" ? user.avatar : user.avatarUrl;
        const avatarUrl = typeof avatarValue === "string" ? avatarValue : null;
        return {
          accountId: id,
          accountName: name,
          avatarUrl,
        };
      },
    },
  };

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return value === "github" || value === "vercel";
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function envPrefix(provider: OAuthProviderId) {
  return provider.toUpperCase();
}

/**
 * Resolves provider credentials. The redirect URI follows the request origin
 * unless an explicit override is configured, so preview deployments break
 * loudly instead of silently using a production callback.
 */
export function getOAuthClientConfig(
  provider: OAuthProviderId,
  origin: string
): OAuthClientConfig | null {
  const prefix = envPrefix(provider);
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const redirectUri =
    process.env[`${prefix}_REDIRECT_URI`] ??
    `${origin}/api/integrations/${provider}/callback`;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      return null;
    }
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

export function isOAuthProviderConfigured(provider: OAuthProviderId): boolean {
  const prefix = envPrefix(provider);
  return Boolean(
    process.env[`${prefix}_CLIENT_ID`] && process.env[`${prefix}_CLIENT_SECRET`]
  );
}

export function getOAuthStateSecret(): string | null {
  return process.env.AUTH_SECRET ?? null;
}
