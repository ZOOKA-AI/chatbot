import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOAuthClientConfig,
  getOAuthStateSecret,
  isOAuthProviderId,
  OAUTH_PROVIDERS,
} from "@/lib/integrations/oauth/config";
import {
  oauthCookiePath,
  oauthStateCookieName,
  readOAuthState,
} from "@/lib/integrations/oauth/state";
import { saveOAuthConnection } from "@/lib/integrations/oauth/store";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function bounce(origin: string, provider: string, outcome: string) {
  return NextResponse.redirect(
    new URL(`/settings/integrations?${provider}=${outcome}`, origin)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  if (!isOAuthProviderId(provider)) {
    return bounce(origin, "oauth", "error");
  }

  const secret = getOAuthStateSecret();
  const config = getOAuthClientConfig(provider, origin);
  if (!secret || !config) {
    return bounce(origin, provider, "unavailable");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const denied = requestUrl.searchParams.get("error");
  if (denied || !code) {
    return bounce(origin, provider, "error");
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(oauthStateCookieName(provider))?.value;
  const verified = readOAuthState(provider, cookieValue, state, secret);
  if (!verified) {
    return bounce(origin, provider, "error");
  }

  const definition = OAUTH_PROVIDERS[provider];
  let tokens: TokenPayload;
  try {
    const tokenResponse = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
    });
    tokens = (await tokenResponse.json()) as TokenPayload;
  } catch {
    return bounce(origin, provider, "error");
  }
  if (!tokens.access_token || tokens.error) {
    return bounce(origin, provider, "token_failed");
  }

  let account: {
    accountId: string | null;
    accountName: string | null;
    avatarUrl: string | null;
  } = { accountId: null, accountName: null, avatarUrl: null };
  try {
    const userResponse = await fetch(definition.userUrl, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (userResponse.ok) {
      account = definition.describeAccount(
        (await userResponse.json()) as Record<string, unknown>
      );
    }
  } catch {
    // A profile lookup failure must not discard a valid token grant.
  }

  const stored = await saveOAuthConnection({
    organizationId: verified.organizationId,
    provider,
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope ?? definition.scopes.join(" "),
    },
    accountId: account.accountId,
    accountName: account.accountName,
    avatarUrl: account.avatarUrl,
    scopes: tokens.scope ?? definition.scopes.join(" "),
    tokenExpiresAt:
      typeof tokens.expires_in === "number"
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
  });
  if (!stored) {
    return bounce(origin, provider, "storage_failed");
  }

  const response = bounce(origin, provider, "success");
  response.cookies.set(oauthStateCookieName(provider), "", {
    httpOnly: true,
    maxAge: 0,
    path: oauthCookiePath(provider),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
