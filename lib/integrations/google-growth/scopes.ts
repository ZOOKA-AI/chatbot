/**
 * Minimal read-only scopes for the growth traffic panel.
 *
 * analytics.readonly  -> GA4 Data API runReport (reads reports; cannot edit
 *                        properties, audiences, goals or data streams)
 * webmasters.readonly -> Search Console searchAnalytics (reads search data;
 *                        cannot change sitemaps, settings or ownership)
 *
 * Nothing here can write to Google: both scopes are read-only by contract, so a
 * leaked token cannot alter the customer's analytics configuration.
 */
export const GOOGLE_ANALYTICS_READ_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

export const GOOGLE_SEARCH_CONSOLE_READ_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export const GOOGLE_GROWTH_SCOPES = [
  GOOGLE_ANALYTICS_READ_SCOPE,
  GOOGLE_SEARCH_CONSOLE_READ_SCOPE,
] as const;

/** Space separated, exactly the format Google's authorization endpoint wants. */
export const GOOGLE_GROWTH_SCOPE_STRING = GOOGLE_GROWTH_SCOPES.join(" ");

/** Stored in OAuthConnection.provider; never reused by another connector. */
export const GOOGLE_GROWTH_PROVIDER = "google_growth";

export type GoogleGrowthTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope: string;
};

export function grantedGrowthScopes(scope: string | null | undefined): string[] {
  if (!scope) {
    return [];
  }
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return GOOGLE_GROWTH_SCOPES.filter((required) => granted.has(required));
}

export function missingGrowthScopes(scope: string | null | undefined): string[] {
  const granted = new Set(grantedGrowthScopes(scope));
  return GOOGLE_GROWTH_SCOPES.filter((required) => !granted.has(required));
}

/**
 * Google reports a dead grant as invalid_grant. That is the only code that means
 * "the user must reconnect": invalid_client is our own misconfiguration and must
 * never delete a healthy connection.
 */
export function isRevokedGrowthGrant(errorCode: unknown): boolean {
  return errorCode === "invalid_grant";
}

/** A token with less than a minute left is treated as expired. */
export const GROWTH_TOKEN_EXPIRY_SKEW_MS = 60_000;

export function isGrowthTokenFresh(
  tokens: Pick<GoogleGrowthTokens, "expiresAt">,
  now: number = Date.now()
): boolean {
  return tokens.expiresAt > now + GROWTH_TOKEN_EXPIRY_SKEW_MS;
}
