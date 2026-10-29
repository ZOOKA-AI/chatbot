import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  deleteGoogleDriveConnectionIfUnchanged,
  getGoogleDriveConnection,
  saveGoogleDriveConnection,
  updateGoogleDriveConnectionIfUnchanged,
} from "@/lib/db/queries";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
  isGoogleDriveEncryptionKeyValid,
} from "@/lib/integrations/google-drive/crypto";
import {
  isRevokedGoogleDriveGrant,
  type GoogleDriveTokens,
} from "@/lib/integrations/google-drive/token-response";

export function getGoogleDriveOAuthConfig() {
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET } = process.env;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  const authSecret = process.env.AUTH_SECRET;

  if (
    !GOOGLE_DRIVE_CLIENT_ID ||
    !GOOGLE_DRIVE_CLIENT_SECRET ||
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
      url.pathname !== "/api/integrations/google-drive/callback"
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    clientId: GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: GOOGLE_DRIVE_CLIENT_SECRET,
    redirectUri,
    encryptionKey,
    authSecret,
  };
}

export function isGoogleDriveConfigured() {
  return getGoogleDriveOAuthConfig() !== null;
}

function encryptTokens(tokens: GoogleDriveTokens) {
  const config = getGoogleDriveOAuthConfig();
  if (!config) {
    throw new Error("Google Drive is not configured");
  }
  return encryptGoogleDriveTokens(JSON.stringify(tokens), config.encryptionKey);
}

function decryptTokens(encryptedTokens: string) {
  const config = getGoogleDriveOAuthConfig();
  if (!config) {
    throw new Error("Google Drive is not configured");
  }
  return z
    .object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
      expiresAt: z.number().finite(),
      scope: z.string().min(1),
    })
    .parse(
      JSON.parse(
        decryptGoogleDriveTokens(encryptedTokens, config.encryptionKey)
      )
    );
}

export async function isGoogleDriveConnected(organizationId: string) {
  const connection = await getGoogleDriveConnection(organizationId);
  if (!connection) {
    return false;
  }
  try {
    decryptTokens(connection.encryptedTokens);
    return true;
  } catch {
    return false;
  }
}

export async function saveGoogleDriveTokens(
  organizationId: string,
  tokens: GoogleDriveTokens
) {
  await saveGoogleDriveConnection({
    organizationId,
    connectionId: randomUUID(),
    encryptedTokens: encryptTokens(tokens),
  });
}

function saveRefreshedGoogleDriveTokens({
  organizationId,
  connectionId,
  previousEncryptedTokens,
  tokens,
}: {
  organizationId: string;
  connectionId: string;
  previousEncryptedTokens: string;
  tokens: GoogleDriveTokens;
}) {
  return updateGoogleDriveConnectionIfUnchanged({
    organizationId,
    connectionId,
    previousEncryptedTokens,
    encryptedTokens: encryptTokens(tokens),
  });
}

export async function getGoogleDriveAccessToken(organizationId: string) {
  const connection = await getGoogleDriveConnection(organizationId);
  if (!connection) {
    return null;
  }

  let tokens: GoogleDriveTokens;
  try {
    tokens = decryptTokens(connection.encryptedTokens);
  } catch {
    return null;
  }

  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  const config = getGoogleDriveOAuthConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorCode =
        typeof result === "object" &&
        result !== null &&
        "error" in result
          ? result.error
          : undefined;
      if (isRevokedGoogleDriveGrant(errorCode)) {
        await deleteGoogleDriveConnectionIfUnchanged({
          organizationId,
          connectionId: connection.connectionId,
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
    const updatedTokens = {
      ...tokens,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? tokens.scope,
    };
    const saved = await saveRefreshedGoogleDriveTokens({
      organizationId,
      connectionId: connection.connectionId,
      previousEncryptedTokens: connection.encryptedTokens,
      tokens: updatedTokens,
    });
    if (saved) {
      return updatedTokens.accessToken;
    }

    const currentConnection = await getGoogleDriveConnection(organizationId);
    if (!currentConnection) {
      return null;
    }
    const currentTokens = decryptTokens(currentConnection.encryptedTokens);
    return currentTokens.expiresAt > Date.now() + 60_000
      ? currentTokens.accessToken
      : null;
  } catch (error) {
    console.error("Google Drive token refresh failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

export async function disconnectGoogleDrive(organizationId: string) {
  const connection = await getGoogleDriveConnection(organizationId);
  if (!connection) {
    return { revoked: false, disconnected: true };
  }
  let revoked = false;
  try {
    const { refreshToken } = decryptTokens(connection.encryptedTokens);
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
    revoked = response.ok;
  } catch (error) {
    console.error("Google Drive token revocation failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
  const disconnected = await deleteGoogleDriveConnectionIfUnchanged({
    organizationId,
    connectionId: connection.connectionId,
  });
  return { revoked, disconnected };
}
