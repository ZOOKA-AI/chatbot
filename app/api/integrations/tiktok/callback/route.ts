import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  fetchAccount,
  type TiktokAccount,
} from "@/lib/integrations/tiktok/api";
import { tiktokStateSecret } from "@/lib/integrations/tiktok/config";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  readTiktokState,
  TIKTOK_STATE_COOKIE,
  TIKTOK_STATE_COOKIE_PATH,
} from "@/lib/integrations/tiktok/state";
import { saveTiktokConnection } from "@/lib/integrations/tiktok/store";

const PAGE = "/workspace/integrations/tiktok";

/**
 * TikTok redirects here on our own domain.
 *
 * Nothing from the query string is trusted except the code: the workspace and
 * the user come from the signed cookie, and the PKCE verifier that belongs to
 * this exact flow is the one that was minted with it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(TIKTOK_STATE_COOKIE)?.value;
  const secret = tiktokStateSecret();

  const fail = (reason: string) => {
    const target = new URL(PAGE, request.url);
    target.searchParams.set("error", reason);
    const response = NextResponse.redirect(target);
    response.cookies.set({
      name: TIKTOK_STATE_COOKIE,
      value: "",
      path: TIKTOK_STATE_COOKIE_PATH,
      maxAge: 0,
    });
    return response;
  };

  if (providerError) {
    return fail(providerError === "access_denied" ? "access_denied" : "provider_error");
  }
  if (!code || !state || !secret) {
    return fail("missing_code");
  }

  const verified = readTiktokState(cookieValue, state, secret);
  if (!verified) {
    // A forged, replayed or expired callback: refuse instead of guessing.
    return fail("invalid_state");
  }

  // The ticket proves who started the flow; the session proves who is finishing
  // it. A link pasted into another browser must not attach a TikTok account to
  // the account that minted it.
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return fail("session_required");
  }
  if (
    context.user.id !== verified.userId ||
    context.organizationId !== verified.organizationId
  ) {
    return fail("session_mismatch");
  }

  const exchanged = await exchangeAuthorizationCode(code, verified.codeVerifier);
  if (!exchanged.ok) {
    return fail(exchanged.error);
  }

  const account = await fetchAccount(exchanged.value.accessToken);
  const resolved: TiktokAccount = account.ok
    ? account.value
    : {
        openId: exchanged.value.openId,
        unionId: null,
        displayName: null,
        avatarUrl: null,
      };

  const saved = await saveTiktokConnection({
    organizationId: verified.organizationId,
    userId: verified.userId,
    tokens: exchanged.value,
    account: resolved,
  });
  if (!saved) {
    return fail("storage_failed");
  }

  const target = new URL(PAGE, request.url);
  target.searchParams.set("connected", "1");
  if (resolved.displayName) {
    target.searchParams.set("account", resolved.displayName);
  }
  const response = NextResponse.redirect(target);
  response.cookies.set({
    name: TIKTOK_STATE_COOKIE,
    value: "",
    path: TIKTOK_STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
