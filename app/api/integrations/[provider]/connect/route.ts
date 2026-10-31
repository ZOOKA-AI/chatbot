import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import {
  getOAuthClientConfig,
  getOAuthStateSecret,
  isOAuthProviderId,
  OAUTH_PROVIDERS,
} from "@/lib/integrations/oauth/config";
import {
  createOAuthState,
  oauthCookiePath,
  oauthStateCookieName,
} from "@/lib/integrations/oauth/state";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!isOAuthProviderId(provider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const context = await requireWorkspaceRole("admin");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace admin access required." },
      { status: 403 }
    );
  }

  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  if (!entitlements.canConnectIntegrations) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?${provider}=upgrade`, request.url)
    );
  }

  const origin = new URL(request.url).origin;
  const config = getOAuthClientConfig(provider, origin);
  const secret = getOAuthStateSecret();
  if (!config || !secret) {
    return NextResponse.json(
      { error: `${provider}_not_configured` },
      { status: 503 }
    );
  }

  const definition = OAUTH_PROVIDERS[provider];
  const { nonce, cookie } = createOAuthState(
    provider,
    context.organizationId,
    context.user.id,
    secret
  );

  const authorizationUrl = new URL(definition.authorizeUrl);
  const search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: nonce,
    response_type: "code",
  });
  if (definition.sendScope && definition.scopes.length > 0) {
    search.set("scope", definition.scopes.join(" "));
    search.set("allow_signup", "false");
  }
  authorizationUrl.search = search.toString();

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(oauthStateCookieName(provider), cookie, {
    httpOnly: true,
    maxAge: 600,
    path: oauthCookiePath(provider),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
