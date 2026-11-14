import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOAuthStateSecret,
  OAUTH_PROVIDERS,
} from "@/lib/integrations/oauth/config";
import {
  oauthStateCookieName,
  readOAuthState,
} from "@/lib/integrations/oauth/state";
import { saveOAuthConnection } from "@/lib/integrations/oauth/store";

const CALLBACK_URI = "https://zooka-ai.com/api/integrations/x/callback";

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  error?: unknown;
}

function bounce(origin: string, outcome: string) {
  return NextResponse.redirect(
    new URL(`/settings/integrations?x=${outcome}`, origin)
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = new URL(CALLBACK_URI).origin;
  const secret = getOAuthStateSecret();
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!secret || !clientId || !clientSecret) {
    return bounce(origin, "unavailable");
  }
  if (requestUrl.searchParams.has("error") || !code || !state) {
    return bounce(origin, "error");
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(oauthStateCookieName("x"))?.value;
  const verified = readOAuthState("x", cookieValue, state, secret);
  if (!verified?.codeVerifier) {
    return bounce(origin, "error");
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verified.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: CALLBACK_URI,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return bounce(origin, "error");
  }
  if (!tokenResponse.ok) {
    return bounce(origin, "token_failed");
  }
  const tokens = (await tokenResponse
    .json()
    .catch(() => null)) as TokenPayload | null;
  if (
    !tokens ||
    tokens.error ||
    typeof tokens.access_token !== "string" ||
    tokens.access_token.length === 0 ||
    typeof tokens.expires_in !== "number" ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0
  ) {
    return bounce(origin, "token_failed");
  }

  let account = {
    accountId: null as string | null,
    accountName: null as string | null,
    avatarUrl: null as string | null,
  };
  try {
    const userResponse = await fetch(OAUTH_PROVIDERS.x.userUrl, {
      headers: {
        Authorization: ["Bearer", tokens.access_token].join(" "),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (userResponse.ok) {
      account = OAUTH_PROVIDERS.x.describeAccount(
        (await userResponse.json()) as Record<string, unknown>
      );
    }
  } catch {
    // Keep a valid grant even if profile lookup is temporarily unavailable.
  }

  const scope =
    typeof tokens.scope === "string"
      ? tokens.scope
      : OAUTH_PROVIDERS.x.scopes.join(" ");
  const stored = await saveOAuthConnection({
    organizationId: verified.organizationId,
    provider: "x",
    tokens: {
      accessToken: tokens.access_token,
      ...(typeof tokens.refresh_token === "string"
        ? { refreshToken: tokens.refresh_token }
        : {}),
      ...(typeof tokens.token_type === "string"
        ? { tokenType: tokens.token_type }
        : {}),
      scope,
    },
    accountId: account.accountId,
    accountName: account.accountName,
    avatarUrl: account.avatarUrl,
    scopes: scope,
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
  if (!stored) {
    return bounce(origin, "storage_failed");
  }

  const response = bounce(origin, "success");
  response.cookies.set(oauthStateCookieName("x"), "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/integrations/x",
    sameSite: "lax",
    secure: true,
  });
  return response;
}
