import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  GOOGLE_GROWTH_COOKIE_PATH,
  GOOGLE_GROWTH_STATE_COOKIE,
  GOOGLE_GROWTH_VERIFIER_COOKIE,
  verifyGrowthOAuthState,
} from "@/lib/integrations/google-growth/oauth-state";
import {
  getGrowthOAuthConfig,
  saveGrowthTokens,
} from "@/lib/integrations/google-growth/server";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string().min(1),
});

function finish(result: string, stage?: string) {
  const config = getGrowthOAuthConfig();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (config ? new URL(config.redirectUri).origin : "http://localhost:3000");
  const response = NextResponse.redirect(
    new URL(
      `/workspace/admin/growth?growth=${result}${stage ? `&stage=${stage}` : ""}`,
      appUrl
    )
  );
  const cookieOptions = {
    httpOnly: true,
    maxAge: 0,
    path: GOOGLE_GROWTH_COOKIE_PATH,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set(GOOGLE_GROWTH_STATE_COOKIE, "", cookieOptions);
  response.cookies.set(GOOGLE_GROWTH_VERIFIER_COOKIE, "", cookieOptions);
  return response;
}

async function GETImpl(request: Request) {
  const requestUrl = new URL(request.url);
  const context = await requireWorkspaceRole("owner");
  const config = getGrowthOAuthConfig();
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const cookies = request.headers.get("cookie")?.split("; ") ?? [];
  const stateCookie = cookies
    .find((cookie) => cookie.startsWith(`${GOOGLE_GROWTH_STATE_COOKIE}=`))
    ?.slice(GOOGLE_GROWTH_STATE_COOKIE.length + 1);
  const verifier = cookies
    .find((cookie) => cookie.startsWith(`${GOOGLE_GROWTH_VERIFIER_COOKIE}=`))
    ?.slice(GOOGLE_GROWTH_VERIFIER_COOKIE.length + 1);

  if (!context || context.user.type !== "regular" || !config) {
    return finish("unavailable");
  }
  if (requestUrl.searchParams.has("error")) {
    // The owner declined the consent screen: nothing was granted, nothing stored.
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

  let stateBinding: ReturnType<typeof verifyGrowthOAuthState>;
  try {
    stateBinding = verifyGrowthOAuthState(
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
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      // Status + Google's short error code only; the body may echo the code.
      console.error("Growth token exchange rejected", {
        status: response.status,
        body: body.slice(0, 200),
      });
      return finish("error", `token_${response.status}`);
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return finish("error", "token_shape");
    }

    // Offline access is the whole point; without a refresh token the connection
    // would die within the hour, so refuse rather than store a half connection.
    if (!parsed.data.refresh_token) {
      return finish("error", "no_refresh_token");
    }

    try {
      await saveGrowthTokens({
        organizationId: stateBinding.organizationId,
        tokens: {
          accessToken: parsed.data.access_token,
          refreshToken: parsed.data.refresh_token,
          expiresAt: Date.now() + parsed.data.expires_in * 1000,
          scope: parsed.data.scope,
        },
        accountName: context.workspace?.name ?? null,
      });
    } catch (error) {
      console.error("Growth token storage failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return finish("error", "save");
    }

    return finish("connected");
  } catch (error) {
    console.error("Growth token exchange failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return finish("error", "token_request");
  }
}

export const GET = withRequestTenantHandler(GETImpl);
