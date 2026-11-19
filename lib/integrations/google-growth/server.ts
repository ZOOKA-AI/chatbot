import "server-only";

import { z } from "zod";

import {
  deleteGrowthOAuthConnection,
  getGrowthOAuthConnection,
  saveGrowthOAuthConnection,
  updateGrowthOAuthConnectionIfUnchanged,
} from "@/lib/db/queries";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
  isGoogleDriveEncryptionKeyValid,
} from "@/lib/integrations/google-drive/crypto";
import {
  GOOGLE_GROWTH_PROVIDER,
  type GoogleGrowthTokens,
  grantedGrowthScopes,
  isGrowthTokenFresh,
  isRevokedGrowthGrant,
  missingGrowthScopes,
} from "@/lib/integrations/google-growth/scopes";

export const GROWTH_REDIRECT_PATH = "/api/integrations/google-growth/callback";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function appOrigin() {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL;
  if (!url) {
    return null;
  }
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Resolves the OAuth client used for the growth connector.
 *
 * Reuses the workspace Google client (the same reviewed OAuth app that already
 * serves Drive/Gmail/Calendar) so no second credential has to be provisioned.
 * The encryption key falls back to the Drive key, which keeps existing
 * deployments working; nothing is read from the frontend.
 */
export function getGrowthOAuthConfig() {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
    process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const encryptionKey =
    process.env.GOOGLE_GROWTH_TOKEN_ENCRYPTION_KEY ??
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  const authSecret = process.env.AUTH_SECRET;

  const configuredRedirect = process.env.GOOGLE_GROWTH_REDIRECT_URI;
  const origin = appOrigin();
  const redirectUri =
    configuredRedirect ??
    (origin ? new URL(GROWTH_REDIRECT_PATH, origin).toString() : null);

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !encryptionKey ||
    !authSecret ||
    !isGoogleDriveEncryptionKeyValid(encryptionKey)
  ) {
    return null;
  }

  try {
    const url = new URL(redirectUri);
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== GROWTH_REDIRECT_PATH
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { clientId, clientSecret, redirectUri, encryptionKey, authSecret };
}

export function isGrowthOAuthConfigured() {
  return getGrowthOAuthConfig() !== null;
}

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite(),
  scope: z.string().min(1),
});

function encryptionKeyOrThrow() {
  const config = getGrowthOAuthConfig();
  if (!config) {
    throw new Error("Growth OAuth is not configured");
  }
  return config.encryptionKey;
}

export function encryptGrowthTokens(tokens: GoogleGrowthTokens) {
  return encryptGoogleDriveTokens(
    JSON.stringify(tokens),
    encryptionKeyOrThrow()
  );
}

export function decryptGrowthTokens(encryptedTokens: string) {
  return tokensSchema.parse(
    JSON.parse(
      decryptGoogleDriveTokens(encryptedTokens, encryptionKeyOrThrow())
    )
  );
}

export type GrowthConnectionStatus = {
  /** Server-side credentials needed to run an OAuth flow are present. */
  configured: boolean;
  connected: boolean;
  provider: typeof GOOGLE_GROWTH_PROVIDER;
  /** Scope strings that were granted, intersected with what we ask for. */
  scopes: string[];
  /** Read-only scopes still missing, so the UI can ask for a fresh consent. */
  missingScopes: string[];
  accountName: string | null;
  expiresAt: string | null;
  /** True when a usable access token can be minted right now. */
  usable: boolean;
  reason?:
    | "not_configured"
    | "not_connected"
    | "missing_scopes"
    | "refresh_failed";
};

/** Stores the granted tokens. Only ciphertext ever reaches the database. */
export async function saveGrowthTokens({
  organizationId,
  tokens,
  accountName,
}: {
  organizationId: string;
  tokens: GoogleGrowthTokens;
  accountName?: string | null;
}) {
  await saveGrowthOAuthConnection({
    organizationId,
    encryptedTokens: encryptGrowthTokens(tokens),
    scopes: tokens.scope,
    accountName: accountName ?? null,
    tokenExpiresAt: new Date(tokens.expiresAt),
  });
}

/**
 * Returns a live access token for this workspace, refreshing it when needed.
 *
 * A revoked grant (invalid_grant) deletes the stored connection so the panel
 * stops claiming it is connected; any other failure leaves the row in place and
 * reports the connection as unusable instead of silently pretending success.
 */
export async function getGrowthAccessToken(
  organizationId: string
): Promise<string | null> {
  const connection = await getGrowthOAuthConnection(organizationId);
  if (!connection) {
    return null;
  }

  let tokens: GoogleGrowthTokens;
  try {
    tokens = decryptGrowthTokens(connection.encryptedTokens);
  } catch {
    return null;
  }

  if (isGrowthTokenFresh(tokens)) {
    return tokens.accessToken;
  }

  const config = getGrowthOAuthConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const result: unknown = await response.json();

    if (!response.ok) {
      const errorCode =
        typeof result === "object" && result !== null && "error" in result
          ? (result as { error?: unknown }).error
          : undefined;
      // Log the provider's error code only, never tokens or payload bodies.
      console.error("Growth token refresh rejected", {
        error: typeof errorCode === "string" ? errorCode : "unknown",
        status: response.status,
      });
      if (isRevokedGrowthGrant(errorCode)) {
        await deleteGrowthOAuthConnection({
          organizationId,
          previousEncryptedTokens: connection.encryptedTokens,
        });
      }
      return null;
    }

    const refreshed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
        scope: z.string().optional(),
      })
      .parse(result);

    const updated: GoogleGrowthTokens = {
      ...tokens,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? tokens.scope,
    };

    const saved = await updateGrowthOAuthConnectionIfUnchanged({
      organizationId,
      previousEncryptedTokens: connection.encryptedTokens,
      encryptedTokens: encryptGrowthTokens(updated),
      tokenExpiresAt: new Date(updated.expiresAt),
    });
    if (saved) {
      return updated.accessToken;
    }

    // Another request refreshed first; use whatever is stored now.
    const current = await getGrowthOAuthConnection(organizationId);
    if (!current) {
      return null;
    }
    try {
      const currentTokens = decryptGrowthTokens(current.encryptedTokens);
      return isGrowthTokenFresh(currentTokens) ? currentTokens.accessToken : null;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Growth token refresh failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

export async function getGrowthConnectionStatus(
  organizationId: string
): Promise<GrowthConnectionStatus> {
  const configured = isGrowthOAuthConfigured();
  const base: GrowthConnectionStatus = {
    configured,
    connected: false,
    provider: GOOGLE_GROWTH_PROVIDER,
    scopes: [],
    missingScopes: [...missingGrowthScopes(null)],
    accountName: null,
    expiresAt: null,
    usable: false,
  };

  const connection = await getGrowthOAuthConnection(organizationId);
  if (!connection) {
    return { ...base, reason: configured ? "not_connected" : "not_configured" };
  }

  const scopes = grantedGrowthScopes(connection.scopes);
  const missing = missingGrowthScopes(connection.scopes);
  const status: GrowthConnectionStatus = {
    ...base,
    connected: true,
    scopes,
    missingScopes: missing,
    accountName: connection.accountName ?? null,
    expiresAt: connection.tokenExpiresAt
      ? connection.tokenExpiresAt.toISOString()
      : null,
  };

  if (missing.length > 0) {
    return { ...status, reason: "missing_scopes" };
  }

  const accessToken = await getGrowthAccessToken(organizationId);
  if (!accessToken) {
    return { ...status, reason: "refresh_failed" };
  }
  return { ...status, usable: true };
}

/**
 * Revokes the grant at Google and deletes the stored ciphertext.
 *
 * Revocation is best effort: if Google is unreachable the local connection is
 * still removed, because the owner asked for the tokens to be gone. The result
 * says exactly which of the two steps happened.
 */
export async function disconnectGrowth(organizationId: string) {
  const connection = await getGrowthOAuthConnection(organizationId);
  if (!connection) {
    return { revoked: false, disconnected: true };
  }

  let revoked = false;
  try {
    const { refreshToken } = decryptGrowthTokens(connection.encryptedTokens);
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
    revoked = response.ok;
  } catch (error) {
    console.error("Growth token revocation failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }

  const disconnected = await deleteGrowthOAuthConnection({
    organizationId,
    previousEncryptedTokens: connection.encryptedTokens,
  });
  return { revoked, disconnected };
}
