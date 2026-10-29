import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const GOOGLE_DRIVE_STATE_COOKIE = "google_drive_oauth_state";
export const GOOGLE_DRIVE_VERIFIER_COOKIE = "google_drive_oauth_verifier";
export const GOOGLE_DRIVE_COOKIE_PATH = "/api/integrations/google-drive";

function signature(
  organizationId: string,
  userId: string,
  nonce: string,
  secret: string
) {
  return createHmac("sha256", secret)
    .update(`${organizationId}:${userId}:${nonce}`)
    .digest("base64url");
}

export function createGoogleDriveOAuthState(
  organizationId: string,
  userId: string,
  secret: string
) {
  const nonce = randomBytes(32).toString("base64url");
  return {
    nonce,
    cookie: `${organizationId}.${userId}.${nonce}.${signature(
      organizationId,
      userId,
      nonce,
      secret
    )}`,
  };
}

export function verifyGoogleDriveOAuthState(
  nonce: string,
  cookie: string,
  secret: string
) {
  const [organizationId, userId, cookieNonce, cookieSignature, ...extra] =
    cookie.split(".");
  if (
    extra.length > 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organizationId ?? ""
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId ?? ""
    ) ||
    !cookieNonce ||
    !cookieSignature ||
    cookieNonce !== nonce
  ) {
    return null;
  }
  const expected = Buffer.from(
    signature(organizationId, userId, cookieNonce, secret),
    "base64url"
  );
  const actual = Buffer.from(cookieSignature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { organizationId, userId };
}

export function createGoogleDriveCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

export function createGoogleDriveCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
