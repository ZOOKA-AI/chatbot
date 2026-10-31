import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import {
  createGoogleDriveCodeChallenge,
  createGoogleDriveCodeVerifier,
  createGoogleDriveOAuthState,
  GOOGLE_DRIVE_COOKIE_PATH,
  GOOGLE_DRIVE_STATE_COOKIE,
  GOOGLE_DRIVE_VERIFIER_COOKIE,
} from "@/lib/integrations/google-drive/oauth-state";
import { getGoogleDriveOAuthConfig } from "@/lib/integrations/google-drive/server";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import {
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_GMAIL_SCOPE,
  GOOGLE_DRIVE_SCOPE,
} from "@/lib/integrations/google-drive/token-response";

export async function GET(request: Request) {
  const context = await requireWorkspaceRole("admin");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace admin access required." },
      {
        status: 403,
      }
    );
  }

  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  if (!entitlements.canConnectIntegrations) {
    return NextResponse.redirect(
      new URL("/settings/integrations?googleDrive=upgrade", request.url)
    );
  }

  const config = getGoogleDriveOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Google Drive OAuth is not configured." },
      { status: 503 }
    );
  }

  const { nonce, cookie } = createGoogleDriveOAuthState(
    context.organizationId,
    context.user.id,
    config.authSecret
  );
  const verifier = createGoogleDriveCodeVerifier();
  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: `${GOOGLE_DRIVE_SCOPE} ${GOOGLE_GMAIL_SCOPE} ${GOOGLE_GMAIL_SEND_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state: nonce,
    code_challenge: createGoogleDriveCodeChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600,
    path: GOOGLE_DRIVE_COOKIE_PATH,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set(GOOGLE_DRIVE_STATE_COOKIE, cookie, cookieOptions);
  response.cookies.set(GOOGLE_DRIVE_VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}
