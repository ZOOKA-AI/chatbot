import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LiveKit access tokens, signed here and nowhere else.
 *
 * The room is namespaced by workspace so one tenant can never name another tenant's room,
 * and the grants are the minimum a participant needs to join and exchange media. When the
 * three environment values are absent the feature is not configured, and every caller must
 * treat that as "not available" rather than pretending a session exists.
 */

export type LiveConfig =
  | { configured: false; reason: "live_not_configured" }
  | { configured: true; url: string; apiKey: string; apiSecret: string };

const ROOM_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function readLiveConfig(
  env: Record<string, string | undefined> = process.env,
): LiveConfig {
  const url = (env.LIVEKIT_URL ?? "").trim();
  const apiKey = (env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (env.LIVEKIT_API_SECRET ?? "").trim();
  if (!url || !apiKey || !apiSecret) {
    return { configured: false, reason: "live_not_configured" };
  }
  return { configured: true, url, apiKey, apiSecret };
}

export function isValidRoomSlug(slug: string): boolean {
  return ROOM_SLUG.test(slug);
}

/** The only place a room name is built. The workspace prefix is not optional. */
export function roomNameFor(organizationId: string, slug: string): string {
  const org = organizationId.trim();
  if (!org) {
    throw new Error("room_requires_workspace");
  }
  if (!isValidRoomSlug(slug)) {
    throw new Error("room_slug_invalid");
  }
  return `ws_${org}__${slug}`;
}

function base64url(input: string | Buffer): string {
  const raw = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type AccessTokenInput = {
  apiKey: string;
  apiSecret: string;
  room: string;
  identity: string;
  name?: string;
  ttlSeconds?: number;
  now?: number;
};

export type AccessToken = { token: string; expiresAt: number };

/**
 * HS256 JWT in the shape LiveKit verifies: iss = API key, sub = participant identity,
 * video grant scoped to one room.
 */
export function createAccessToken(input: AccessTokenInput): AccessToken {
  const { apiKey, apiSecret, room, identity } = input;
  if (!apiKey || !apiSecret) {
    throw new Error("live_credentials_missing");
  }
  if (!room || !identity) {
    throw new Error("live_room_or_identity_missing");
  }
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 3600, 60), 21600);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const exp = now + ttl;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    ...(input.name ? { name: input.name } : {}),
    nbf: now - 10,
    exp,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // HS256 is HMAC-SHA256 by definition (RFC 7518 section 3.2), and LiveKit verifies exactly
  // that. This is a message authentication code over a server-issued high-entropy API secret,
  // not a password hash, so a slow KDF would break interoperability and add nothing:
  // codeql[js/insufficient-password-hash]
  const signature = base64url(createHmac("sha256", apiSecret).update(signingInput).digest());

  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}

/** Verification lives here too so a test can prove the signature, not just the shape. */
export function verifyAccessToken(token: string, apiSecret: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("token_malformed");
  }
  const [header, payload, signature] = parts;
  // Same HMAC as above: this is signature verification, not password hashing. The marker
  // must sit on the line directly above the call, or CodeQL does not read it.
  // codeql[js/insufficient-password-hash]
  const expectedHmac = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest();
  const expected = base64url(expectedHmac);
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature, "utf8");
  // Constant-time comparison: a byte-by-byte early exit leaks how much of a forged
  // signature was correct.
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    throw new Error("token_signature_invalid");
  }
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<string, unknown>;
}
