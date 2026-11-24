import "server-only";

/**
 * TikTok Content Posting API — ZOOKA-AI multi-user integration.
 *
 * Every value here is a fact from the official docs read on 2026-11-21
 * (developers.tiktok.com, "Get Started - Upload", "Login Kit for Web"):
 *   authorize  https://www.tiktok.com/v2/auth/authorize/
 *   token      https://open.tiktokapis.com/v2/oauth/token/
 *   revoke     https://open.tiktokapis.com/v2/oauth/revoke/
 *   user info  https://open.tiktokapis.com/v2/user/info/
 *
 * Only two scopes are requested, and both are used by shipped code:
 *   user.info.basic — to show the creator the account they authorized
 *   video.upload    — to place the video in that creator's own TikTok inbox
 * Direct Post (video.publish) is deliberately absent: no feature of this
 * product posts without the creator finishing the post inside TikTok, so asking
 * for it would be an unjustified permission.
 */

export const TIKTOK_SCOPES = ["user.info.basic", "video.upload"] as const;

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
export const TIKTOK_API_BASE = "https://open.tiktokapis.com";

/** The callback lives on our own verified domain, never on a third-party host. */
export const TIKTOK_CALLBACK_PATH = "/api/integrations/tiktok/callback";
export const TIKTOK_DEFAULT_BASE_URL = "https://zooka-ai.com";

export function tiktokClientKey(): string | null {
  const value = process.env.TIKTOK_CLIENT_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

export function tiktokClientSecret(): string | null {
  const value = process.env.TIKTOK_CLIENT_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

export function isTiktokConfigured(): boolean {
  return tiktokClientKey() !== null && tiktokClientSecret() !== null;
}

/**
 * The redirect URI must match the one registered on the TikTok app byte for
 * byte. The base is therefore configuration, not the incoming request origin:
 * a preview host would otherwise produce an unregistered URI and TikTok would
 * refuse the authorization.
 */
export function tiktokRedirectUri(): string {
  const base = (
    process.env.TIKTOK_REDIRECT_BASE_URL?.trim() || TIKTOK_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  return `${base}${TIKTOK_CALLBACK_PATH}`;
}

export function tiktokStateSecret(): string | null {
  const value =
    process.env.TIKTOK_STATE_SECRET?.trim() ??
    process.env.TOKEN_ENCRYPTION_KEY?.trim();
  return value && value.length >= 16 ? value : null;
}
