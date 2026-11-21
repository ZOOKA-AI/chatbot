import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth state + PKCE for TikTok.
 *
 * The callback trusts only the signed cookie, never the `state` query string, so
 * a forged callback cannot attach an attacker's TikTok account to a signed-in
 * ZOOKA-AI user. The PKCE verifier travels inside the same signed cookie and is
 * bound to the signature, so it cannot be swapped either.
 */

export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";
export const TIKTOK_STATE_TTL_SECONDS = 600;
export const TIKTOK_STATE_COOKIE_PATH = "/api/integrations/tiktok";

export interface TiktokStateInput {
  organizationId: string;
  userId: string;
}

export interface TiktokStateTicket {
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  cookie: string;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createCodeVerifier(): string {
  return base64url(randomBytes(48));
}

export function codeChallengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function sign(
  organizationId: string,
  userId: string,
  nonce: string,
  codeVerifier: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`tiktok:${organizationId}:${userId}:${nonce}:${codeVerifier}`)
    .digest("base64url");
}

export function createTiktokState(
  input: TiktokStateInput,
  secret: string
): TiktokStateTicket {
  const nonce = base64url(randomBytes(32));
  const codeVerifier = createCodeVerifier();
  const signature = sign(
    input.organizationId,
    input.userId,
    nonce,
    codeVerifier,
    secret
  );
  return {
    nonce,
    codeVerifier,
    codeChallenge: codeChallengeFor(codeVerifier),
    cookie: [input.organizationId, input.userId, nonce, codeVerifier, signature].join("."),
  };
}

export interface TiktokStateResult {
  organizationId: string;
  userId: string;
  codeVerifier: string;
}

export function readTiktokState(
  cookieValue: string | undefined,
  nonce: string | null,
  secret: string
): TiktokStateResult | null {
  if (!cookieValue || !nonce) {
    return null;
  }
  const parts = cookieValue.split(".");
  if (parts.length !== 5) {
    return null;
  }
  const [organizationId, userId, cookieNonce, codeVerifier, signature] = parts;
  if (!organizationId || !userId || !cookieNonce || !codeVerifier || !signature) {
    return null;
  }
  if (cookieNonce !== nonce) {
    return null;
  }
  const expected = sign(organizationId, userId, cookieNonce, codeVerifier, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return { organizationId, userId, codeVerifier };
}
