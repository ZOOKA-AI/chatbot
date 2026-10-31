import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { oauthConnection } from "@/lib/db/schema";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
} from "@/lib/integrations/google-drive/crypto";
import type { OAuthProviderId } from "@/lib/integrations/oauth/config";

export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
}

export interface OAuthConnectionSummary {
  provider: OAuthProviderId;
  accountName: string | null;
  avatarUrl: string | null;
  connectedAt: Date;
}

function getEncryptionKey(): string | null {
  return (
    process.env.TOKEN_ENCRYPTION_KEY ??
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY ??
    null
  );
}

/**
 * Stores an OAuth token bundle encrypted with AES-256-GCM. Only the ciphertext
 * ever reaches the database; plaintext tokens stay in process memory.
 */
export async function saveOAuthConnection(params: {
  organizationId: string;
  provider: OAuthProviderId;
  tokens: OAuthTokenBundle;
  accountId: string | null;
  accountName: string | null;
  avatarUrl: string | null;
  scopes: string | null;
  tokenExpiresAt: Date | null;
}): Promise<boolean> {
  const key = getEncryptionKey();
  if (!key) {
    return false;
  }
  let encrypted: string;
  try {
    encrypted = encryptGoogleDriveTokens(JSON.stringify(params.tokens), key);
  } catch {
    return false;
  }
  try {
    await db
      .insert(oauthConnection)
      .values({
        organizationId: params.organizationId,
        provider: params.provider,
        encryptedTokens: encrypted,
        accountId: params.accountId,
        accountName: params.accountName,
        avatarUrl: params.avatarUrl,
        scopes: params.scopes,
        tokenExpiresAt: params.tokenExpiresAt,
      })
      .onConflictDoUpdate({
        target: [oauthConnection.organizationId, oauthConnection.provider],
        set: {
          encryptedTokens: encrypted,
          accountId: params.accountId,
          accountName: params.accountName,
          avatarUrl: params.avatarUrl,
          scopes: params.scopes,
          tokenExpiresAt: params.tokenExpiresAt,
          updatedAt: new Date(),
        },
      });
    return true;
  } catch {
    // Missing table or unreachable database: report a storage failure, not a crash.
    return false;
  }
}

export async function getOAuthConnection(
  organizationId: string,
  provider: OAuthProviderId
): Promise<OAuthConnectionSummary | null> {
  let row:
    | {
        accountName: string | null;
        avatarUrl: string | null;
        createdAt: Date;
      }
    | undefined;
  try {
    [row] = await db
      .select({
        accountName: oauthConnection.accountName,
        avatarUrl: oauthConnection.avatarUrl,
        createdAt: oauthConnection.createdAt,
      })
      .from(oauthConnection)
      .where(
        and(
          eq(oauthConnection.organizationId, organizationId),
          eq(oauthConnection.provider, provider)
        )
      )
      .limit(1);
  } catch {
    return null;
  }
  if (!row) {
    return null;
  }
  return {
    provider,
    accountName: row.accountName,
    avatarUrl: row.avatarUrl,
    connectedAt: row.createdAt,
  };
}

/** Decrypts the stored bundle for outbound API calls made by agent tools. */
export async function getOAuthAccessToken(
  organizationId: string,
  provider: OAuthProviderId
): Promise<string | null> {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }
  let row: { encryptedTokens: string } | undefined;
  try {
    [row] = await db
      .select({ encryptedTokens: oauthConnection.encryptedTokens })
      .from(oauthConnection)
      .where(
        and(
          eq(oauthConnection.organizationId, organizationId),
          eq(oauthConnection.provider, provider)
        )
      )
      .limit(1);
  } catch {
    return null;
  }
  if (!row) {
    return null;
  }
  try {
    const bundle = JSON.parse(
      decryptGoogleDriveTokens(row.encryptedTokens, key)
    ) as OAuthTokenBundle;
    return bundle.accessToken || null;
  } catch {
    return null;
  }
}

export async function deleteOAuthConnection(
  organizationId: string,
  provider: OAuthProviderId
): Promise<void> {
  try {
    await db
      .delete(oauthConnection)
      .where(
        and(
          eq(oauthConnection.organizationId, organizationId),
          eq(oauthConnection.provider, provider)
        )
      );
  } catch {
    // nothing stored yet
  }
}
