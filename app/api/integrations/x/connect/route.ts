import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import {
  createOAuthState,
  oauthStateCookieName,
} from "@/lib/integrations/oauth/state";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

const CALLBACK_URI = "https://zooka-ai.com/api/integrations/x/callback";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

export async function GET(request: Request) {
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
      new URL("/settings/integrations?x=upgrade", request.url)
    );
  }

  const clientId = process.env.X_CLIENT_ID;
  const secret = process.env.AUTH_SECRET;
  if (!clientId || !process.env.X_CLIENT_SECRET || !secret) {
    return NextResponse.json({ error: "x_not_configured" }, { status: 503 });
  }

  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const { nonce, cookie } = createOAuthState(
    "x",
    context.organizationId,
    context.user.id,
    secret,
    { codeVerifier }
  );
  const authorizeUrl = new URL("https://x.com/i/oauth2/authorize");
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK_URI,
    scope: SCOPES.join(" "),
    state: nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(oauthStateCookieName("x"), cookie, {
    httpOnly: true,
    maxAge: 600,
    path: "/api/integrations/x",
    sameSite: "lax",
    secure: true,
  });
  return response;
}
