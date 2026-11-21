import "server-only";

export type OAuthProviderId = "github" | "vercel" | "x" | "meta" | "linkedin";

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scopes: string[];
  /** Some providers (Vercel) refuse an unknown scope parameter. */
  sendScope: boolean;
  /**
   * How the token endpoint expects the exchange. GitHub, Vercel and X read a
   * JSON body; Meta and LinkedIn are form-encoded OAuth 2.0 servers and reject
   * JSON outright, so the encoding is part of the provider definition rather
   * than a guess inside the callback.
   */
  tokenBody: "json" | "form";
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
      tokenBody: "json",
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
      tokenBody: "json",
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
    /**
     * Facebook Login is the OAuth front door for the Meta family: the same grant
     * returns the pages the user manages and, through them, the Instagram
     * business account. It runs on the Facebook Login app that already exists in
     * production, so no second Meta app has to be registered and reviewed.
     */
    meta: {
      id: "meta",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      userUrl: "https://graph.facebook.com/v21.0/me?fields=id,name",
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
        "business_management",
      ],
      sendScope: true,
      tokenBody: "form",
      describeAccount: (payload) => {
        const id =
          typeof payload.id === "string" || typeof payload.id === "number"
            ? String(payload.id)
            : null;
        const name = typeof payload.name === "string" ? payload.name : null;
        return { accountId: id, accountName: name, avatarUrl: null };
      },
    },
    linkedin: {
      id: "linkedin",
      authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      userUrl: "https://api.linkedin.com/v2/userinfo",
      scopes: ["openid", "profile", "email", "w_member_social"],
      sendScope: true,
      tokenBody: "form",
      describeAccount: (payload) => {
        const id =
          typeof payload.sub === "string" || typeof payload.sub === "number"
            ? String(payload.sub)
            : null;
        const name =
          typeof payload.name === "string"
            ? payload.name
            : typeof payload.email === "string"
              ? payload.email
              : null;
        return {
          accountId: id,
          accountName: name,
          avatarUrl:
            typeof payload.picture === "string" ? payload.picture : null,
        };
      },
    },
    x: {
      id: "x",
      authorizeUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      userUrl: "https://api.x.com/2/users/me?user.fields=profile_image_url",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      sendScope: true,
      tokenBody: "json",
      describeAccount: (payload) => {
        const user = (payload.data ?? payload) as Record<string, unknown>;
        const id =
          typeof user.id === "string" || typeof user.id === "number"
            ? String(user.id)
            : null;
        const username =
          typeof user.username === "string" ? user.username : null;
        const name = typeof user.name === "string" ? user.name : null;
        return {
          accountId: id,
          accountName: username ? `@${username}` : name,
          avatarUrl:
            typeof user.profile_image_url === "string"
              ? user.profile_image_url
              : null,
        };
      },
    },
  };

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return Object.hasOwn(OAUTH_PROVIDERS, value);
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Meta is reached through the existing Facebook Login app, whose variables were
 * named before this provider existed, so the prefix is mapped rather than
 * derived: FACEBOOK_LOGIN_CLIENT_ID, not META_CLIENT_ID.
 */
const ENV_PREFIX: Partial<Record<OAuthProviderId, string>> = {
  meta: "FACEBOOK_LOGIN",
};

function envPrefix(provider: OAuthProviderId) {
  return ENV_PREFIX[provider] ?? provider.toUpperCase();
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
    provider === "x"
      ? "https://zooka-ai.com/api/integrations/x/callback"
      : (process.env[`${prefix}_REDIRECT_URI`] ??
        `${origin}/api/integrations/${provider}/callback`);
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
