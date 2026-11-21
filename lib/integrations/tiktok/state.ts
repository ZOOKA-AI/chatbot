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
/** A ticket minted a little ahead of our clock is tolerated, a stale one is not. */
const FUTURE_SKEW_MS = 60_000;
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
  issuedAt: number,
  secret: string
): string {
  // issuedAt is inside the signature, so the browser cannot stretch the life of
  // a state ticket by editing the cookie: changing the timestamp invalidates
  // the HMAC and the callback is refused.
  return createHmac("sha256", secret)
    .update(
      `tiktok:${organizationId}:${userId}:${nonce}:${codeVerifier}:${issuedAt}`
    )
    .digest("base64url");
}

export function createTiktokState(
  input: TiktokStateInput,
  secret: string
): TiktokStateTicket {
  const nonce = base64url(randomBytes(32));
  const codeVerifier = createCodeVerifier();
  const issuedAt = Date.now();
  const signature = sign(
    input.organizationId,
    input.userId,
    nonce,
    codeVerifier,
    issuedAt,
    secret
  );
  return {
    nonce,
    codeVerifier,
    codeChallenge: codeChallengeFor(codeVerifier),
    cookie: [
      input.organizationId,
      input.userId,
      nonce,
      codeVerifier,
      String(issuedAt),
      signature,
    ].join("."),
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
  secret: string,
  now: number = Date.now()
): TiktokStateResult | null {
  if (!cookieValue || !nonce) {
    return null;
  }
  const parts = cookieValue.split(".");
  if (parts.length !== 6) {
    return null;
  }
  const [
    organizationId,
    userId,
    cookieNonce,
    codeVerifier,
    issuedAtRaw,
    signature,
  ] = parts;
  if (
    !organizationId ||
    !userId ||
    !cookieNonce ||
    !codeVerifier ||
    !issuedAtRaw ||
    !signature
  ) {
    return null;
  }
  if (cookieNonce !== nonce) {
    return null;
  }
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) {
    return null;
  }
  // Server-side lifetime, enforced here rather than trusted from the browser.
  const age = now - issuedAt;
  if (age < -FUTURE_SKEW_MS || age > TIKTOK_STATE_TTL_SECONDS * 1000) {
    return null;
  }
  const expected = sign(
    organizationId,
    userId,
    cookieNonce,
    codeVerifier,
    issuedAt,
    secret
  );
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return { organizationId, userId, codeVerifier };
}
