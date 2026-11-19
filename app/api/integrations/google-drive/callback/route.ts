import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import {
  GOOGLE_DRIVE_COOKIE_PATH,
  GOOGLE_DRIVE_STATE_COOKIE,
  GOOGLE_DRIVE_VERIFIER_COOKIE,
  verifyGoogleDriveOAuthState,
} from "@/lib/integrations/google-drive/oauth-state";
import {
  getGoogleDriveOAuthConfig,
  saveGoogleDriveTokens,
} from "@/lib/integrations/google-drive/server";
import { parseGoogleDriveTokens } from "@/lib/integrations/google-drive/token-response";

function finish(result: string, stage?: string) {
  const config = getGoogleDriveOAuthConfig();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (config ? new URL(config.redirectUri).origin : "http://localhost:3000");
  const response = NextResponse.redirect(
    new URL(
      `/settings/integrations?googleDrive=${result}${stage ? `&stage=${stage}` : ""}`,
      appUrl
    )
  );
  const cookieOptions = {
    httpOnly: true,
    maxAge: 0,
    path: GOOGLE_DRIVE_COOKIE_PATH,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set(GOOGLE_DRIVE_STATE_COOKIE, "", cookieOptions);
  response.cookies.set(GOOGLE_DRIVE_VERIFIER_COOKIE, "", cookieOptions);
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const context = await requireWorkspaceRole("admin");
  const config = getGoogleDriveOAuthConfig();
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const cookies = request.headers.get("cookie")?.split("; ") ?? [];
  const stateCookie = cookies
    .find((cookie) => cookie.startsWith(`${GOOGLE_DRIVE_STATE_COOKIE}=`))
    ?.slice(GOOGLE_DRIVE_STATE_COOKIE.length + 1);
  const verifier = cookies
    .find((cookie) => cookie.startsWith(`${GOOGLE_DRIVE_VERIFIER_COOKIE}=`))
    ?.slice(GOOGLE_DRIVE_VERIFIER_COOKIE.length + 1);

  if (!context || context.user.type !== "regular" || !config) {
    return finish("unavailable");
  }
  if (requestUrl.searchParams.has("error")) {
    return finish("cancelled");
  }
  if (!state || !code || !stateCookie || !verifier) {
    return finish(
      "error",
      state
        ? code
          ? stateCookie
            ? "no_verifier"
            : "no_state_cookie"
          : "no_code"
        : "no_state"
    );
  }

  let stateBinding: ReturnType<typeof verifyGoogleDriveOAuthState>;
  try {
    stateBinding = verifyGoogleDriveOAuthState(
      state,
      decodeURIComponent(stateCookie),
      config.authSecret
    );
  } catch {
    return finish("error", "state_verify");
  }
  if (
    !stateBinding ||
    stateBinding.organizationId !== context.organizationId ||
    stateBinding.userId !== context.user.id
  ) {
    return finish("error", "state_binding");
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: decodeURIComponent(verifier),
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("Google token exchange rejected", {
        status: response.status,
        body: body.slice(0, 300),
      });
      return finish("error", `token_${response.status}`);
    }
    const value = await response.json();
    const tokens = parseGoogleDriveTokens(value);
    try {
      await saveGoogleDriveTokens(stateBinding.organizationId, tokens);
    } catch (error) {
      console.error("Google Drive token storage failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return finish("error", "save");
    }
    return finish("connected");
  } catch (error) {
    console.error("Google Drive OAuth callback failed", {
      reason: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : undefined,
    });
    return finish("error", "exception");
  }
}
