import { NextResponse } from "next/server";

import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  createGrowthCodeChallenge,
  createGrowthCodeVerifier,
  createGrowthOAuthState,
  GOOGLE_GROWTH_COOKIE_PATH,
  GOOGLE_GROWTH_STATE_COOKIE,
  GOOGLE_GROWTH_VERIFIER_COOKIE,
} from "@/lib/integrations/google-growth/oauth-state";
import { getGrowthOAuthConfig } from "@/lib/integrations/google-growth/server";
import { GOOGLE_GROWTH_SCOPE_STRING } from "@/lib/integrations/google-growth/scopes";

/**
 * Starts the read-only growth consent flow.
 *
 * Owner only: the connected property exposes site traffic and search queries,
 * which is business-sensitive, so it is not offered to members. The scopes are
 * the two read-only ones in scopes.ts and nothing else.
 */
async function GETImpl(request: Request) {
  const context = await requireWorkspaceRole("owner");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace owner access required." },
      { status: 403 }
    );
  }

  const config = getGrowthOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Growth OAuth is not configured on this deployment." },
      { status: 503 }
    );
  }

  const { nonce, cookie } = createGrowthOAuthState(
    context.organizationId,
    context.user.id,
    config.authSecret
  );
  const verifier = createGrowthCodeVerifier();

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_GROWTH_SCOPE_STRING,
    access_type: "offline",
    // Always ask: Google only returns a refresh token on a fresh consent.
    prompt: "consent",
    include_granted_scopes: "false",
    state: nonce,
    code_challenge: createGrowthCodeChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600,
    path: GOOGLE_GROWTH_COOKIE_PATH,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set(GOOGLE_GROWTH_STATE_COOKIE, cookie, cookieOptions);
  response.cookies.set(GOOGLE_GROWTH_VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}

// Tenant-scoped: the connection row is read and written inside the caller's
// tenant transaction, so row level security evaluates for this workspace.
export const GET = withRequestTenantHandler(GETImpl);
