/**
 * CSRF state + PKCE for the growth connector.
 *
 * The signing and PKCE helpers are the same reviewed implementations the Google
 * Drive connector uses (HMAC over organizationId:userId:nonce, S256 challenge).
 * Only the cookie names and path differ, so the two connectors cannot read or
 * overwrite each other's in-flight authorization.
 */
import {
  createGoogleDriveCodeChallenge,
  createGoogleDriveCodeVerifier,
  createGoogleDriveOAuthState,
  verifyGoogleDriveOAuthState,
} from "@/lib/integrations/google-drive/oauth-state";

export const GOOGLE_GROWTH_STATE_COOKIE = "google_growth_oauth_state";
export const GOOGLE_GROWTH_VERIFIER_COOKIE = "google_growth_oauth_verifier";
export const GOOGLE_GROWTH_COOKIE_PATH = "/api/integrations/google-growth";

export const createGrowthOAuthState = createGoogleDriveOAuthState;
export const verifyGrowthOAuthState = verifyGoogleDriveOAuthState;
export const createGrowthCodeVerifier = createGoogleDriveCodeVerifier;
export const createGrowthCodeChallenge = createGoogleDriveCodeChallenge;
