import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OAuthProviderId } from "@/lib/integrations/oauth/config";

export function oauthStateCookieName(provider: OAuthProviderId) {
  return `oauth_state_${provider}`;
}

export function oauthCookiePath(provider: OAuthProviderId) {
  return `/api/integrations/${provider}`;
}

function signature(
  provider: OAuthProviderId,
  organizationId: string,
  userId: string,
  nonce: string,
  secret: string,
  codeVerifier?: string
) {
  const hmac = createHmac("sha256", secret).update(
    `${provider}:${organizationId}:${userId}:${nonce}`
  );
  if (codeVerifier) {
    hmac.update(`:${codeVerifier}`);
  }
  return hmac.digest("base64url");
}

export function createOAuthState(
  provider: OAuthProviderId,
  organizationId: string,
  userId: string,
  secret: string,
  options: { codeVerifier?: string } = {}
) {
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = options.codeVerifier;
  return {
    nonce,
    cookie: `${organizationId}.${userId}.${nonce}.${signature(
      provider,
      organizationId,
      userId,
      nonce,
      secret,
      codeVerifier
    )}${codeVerifier ? `.${codeVerifier}` : ""}`,
  };
}

/**
 * Verifies the round-trip state cookie. The callback trusts only this signature,
 * never the raw `state` query parameter, so a forged callback cannot attach an
 * attacker's token to somebody else's workspace.
 */
export function readOAuthState(
  provider: OAuthProviderId,
  cookieValue: string | undefined,
  nonce: string | null,
  secret: string
): { organizationId: string; userId: string; codeVerifier?: string } | null {
  if (!cookieValue || !nonce) {
    return null;
  }
  const [
    organizationId,
    userId,
    cookieNonce,
    cookieSignature,
    codeVerifier,
    ...extra
  ] = cookieValue.split(".");
  if (
    !organizationId ||
    !userId ||
    !cookieNonce ||
    !cookieSignature ||
    extra.length > 0 ||
    (codeVerifier !== undefined &&
      !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) ||
    cookieNonce !== nonce
  ) {
    return null;
  }
  const expected = signature(
    provider,
    organizationId,
    userId,
    cookieNonce,
    secret,
    codeVerifier
  );
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(cookieSignature);
  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }
  return {
    organizationId,
    userId,
    ...(codeVerifier ? { codeVerifier } : {}),
  };
}
