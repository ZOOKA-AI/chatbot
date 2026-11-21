import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  isTiktokConfigured,
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_SCOPES,
  tiktokClientKey,
  tiktokRedirectUri,
  tiktokStateSecret,
} from "@/lib/integrations/tiktok/config";
import {
  createTiktokState,
  TIKTOK_STATE_COOKIE,
  TIKTOK_STATE_COOKIE_PATH,
  TIKTOK_STATE_TTL_SECONDS,
} from "@/lib/integrations/tiktok/state";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

const PAGE = "/workspace/integrations/tiktok";

function backToPage(request: Request, params: Record<string, string>) {
  const url = new URL(PAGE, request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

/**
 * Starts the TikTok authorization for the signed-in person.
 *
 * The state nonce and the PKCE verifier are minted here and stored only in an
 * httpOnly cookie signed with our secret, so the callback can prove the person
 * who returns is the person who started.
 */
async function GETImpl(request: Request) {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!["owner", "admin"].includes(String(context.role))) {
    return backToPage(request, { error: "forbidden" });
  }
  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  if (!entitlements.canConnectIntegrations) {
    return backToPage(request, { error: "upgrade_required" });
  }

  const secret = tiktokStateSecret();
  const clientKey = tiktokClientKey();
  if (!isTiktokConfigured() || !secret || !clientKey) {
    return backToPage(request, { error: "not_configured" });
  }

  const ticket = createTiktokState(
    { organizationId: context.organizationId, userId: context.user.id },
    secret
  );

  const authorizeUrl = new URL(TIKTOK_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_key", clientKey);
  authorizeUrl.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", tiktokRedirectUri());
  authorizeUrl.searchParams.set("state", ticket.nonce);
  authorizeUrl.searchParams.set("code_challenge", ticket.codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("disable_auto_auth", "1");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: TIKTOK_STATE_COOKIE,
    value: ticket.cookie,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: TIKTOK_STATE_COOKIE_PATH,
    maxAge: TIKTOK_STATE_TTL_SECONDS,
  });
  return response;
}

export const GET = withRequestTenantHandler(GETImpl);
