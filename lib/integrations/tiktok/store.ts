import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { tiktokConnection, tiktokUpload } from "@/lib/db/schema";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
} from "@/lib/integrations/google-drive/crypto";
import { runExclusive } from "@/lib/integrations/tiktok/single-flight";
import {
  fetchAccount,
  refreshAccessToken,
  type TiktokAccount,
  type TiktokTokens,
} from "@/lib/integrations/tiktok/api";

/**
 * Persistence for the per-creator TikTok authorization.
 *
 * The cipher is the one already vetted in this repository and used by
 * lib/integrations/oauth/store.ts for every provider; only the key name is
 * shared, so no second crypto implementation is introduced here. Ciphertext is
 * the only thing that reaches the database.
 */

function encryptionKey(): string | null {
  return process.env.TOKEN_ENCRYPTION_KEY?.trim() || null;
}

export function isTiktokStorageKeyPresent(): boolean {
  return encryptionKey() !== null;
}

export interface TiktokConnectionView {
  connected: boolean;
  openId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
  updatedAt: Date | null;
}

const EMPTY_VIEW: TiktokConnectionView = {
  connected: false,
  openId: null,
  displayName: null,
  avatarUrl: null,
  scopes: [],
  accessExpiresAt: null,
  refreshExpiresAt: null,
  updatedAt: null,
};

export async function saveTiktokConnection(params: {
  organizationId: string;
  userId: string;
  tokens: TiktokTokens;
  account: TiktokAccount;
}): Promise<boolean> {
  const key = encryptionKey();
  if (!key) {
    return false;
  }
  let encrypted: string;
  try {
    encrypted = encryptGoogleDriveTokens(
      JSON.stringify({
        accessToken: params.tokens.accessToken,
        refreshToken: params.tokens.refreshToken,
      }),
      key
    );
  } catch {
    return false;
  }
  try {
    await db
      .insert(tiktokConnection)
      .values({
        organizationId: params.organizationId,
        userId: params.userId,
        openId: params.account.openId,
        displayName: params.account.displayName,
        avatarUrl: params.account.avatarUrl,
        scopes: params.tokens.scope || null,
        encryptedTokens: encrypted,
        accessExpiresAt: params.tokens.accessExpiresAt,
        refreshExpiresAt: params.tokens.refreshExpiresAt,
      })
      .onConflictDoUpdate({
        target: [tiktokConnection.organizationId, tiktokConnection.userId],
        set: {
          openId: params.account.openId,
          displayName: params.account.displayName,
          avatarUrl: params.account.avatarUrl,
          scopes: params.tokens.scope || null,
          encryptedTokens: encrypted,
          accessExpiresAt: params.tokens.accessExpiresAt,
          refreshExpiresAt: params.tokens.refreshExpiresAt,
          updatedAt: new Date(),
        },
      });
    return true;
  } catch {
    // Missing table or unreachable database: a storage failure, not a crash.
    return false;
  }
}

export async function getTiktokConnectionView(
  organizationId: string,
  userId: string
): Promise<TiktokConnectionView> {
  try {
    const [row] = await db
      .select({
        openId: tiktokConnection.openId,
        displayName: tiktokConnection.displayName,
        avatarUrl: tiktokConnection.avatarUrl,
        scopes: tiktokConnection.scopes,
        accessExpiresAt: tiktokConnection.accessExpiresAt,
        refreshExpiresAt: tiktokConnection.refreshExpiresAt,
        updatedAt: tiktokConnection.updatedAt,
      })
      .from(tiktokConnection)
      .where(
        and(
          eq(tiktokConnection.organizationId, organizationId),
          eq(tiktokConnection.userId, userId)
        )
      )
      .limit(1);
    if (!row) {
      return EMPTY_VIEW;
    }
    return {
      connected: true,
      openId: row.openId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      scopes: row.scopes ? row.scopes.split(/[\s,]+/).filter(Boolean) : [],
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      updatedAt: row.updatedAt,
    };
  } catch {
    return EMPTY_VIEW;
  }
}

export interface TiktokAccess {
  accessToken: string;
  openId: string;
  refreshed: boolean;
}

/**
 * Returns a usable access token for this exact user, refreshing and persisting
 * when the stored one is about to expire. Refusing (null) is the correct answer
 * when there is no connection: the caller must not fall back to another user's
 * token.
 */
export async function getTiktokAccess(
  organizationId: string,
  userId: string
): Promise<TiktokAccess | null> {
  const key = encryptionKey();
  if (!key) {
    return null;
  }
  let row:
    | {
        openId: string;
        encryptedTokens: string;
        accessExpiresAt: Date | null;
        refreshExpiresAt: Date | null;
      }
    | undefined;
  try {
    [row] = await db
      .select({
        openId: tiktokConnection.openId,
        encryptedTokens: tiktokConnection.encryptedTokens,
        accessExpiresAt: tiktokConnection.accessExpiresAt,
        refreshExpiresAt: tiktokConnection.refreshExpiresAt,
      })
      .from(tiktokConnection)
      .where(
        and(
          eq(tiktokConnection.organizationId, organizationId),
          eq(tiktokConnection.userId, userId)
        )
      )
      .limit(1);
  } catch {
    return null;
  }
  if (!row) {
    return null;
  }

  let tokens: { accessToken?: string; refreshToken?: string };
  try {
    tokens = JSON.parse(decryptGoogleDriveTokens(row.encryptedTokens, key));
  } catch {
    return null;
  }
  const accessToken = tokens.accessToken ?? "";
  const refreshToken = tokens.refreshToken ?? "";
  if (!accessToken || !refreshToken) {
    return null;
  }

  const expiresAt = row.accessExpiresAt?.getTime() ?? 0;
  const needsRefresh = expiresAt - Date.now() < 60_000;
  if (!needsRefresh) {
    return { accessToken, openId: row.openId, refreshed: false };
  }

  // Serialised per creator: two parallel requests must not spend the same
  // rotating refresh token, because the loser is told invalid_grant and a
  // believed answer there disconnects the creator permanently.
  const refreshed = await runExclusive(
    `tiktok-refresh:${organizationId}:${userId}`,
    () => refreshAccessToken(refreshToken)
  );
  if (!refreshed.ok) {
    return null;
  }
  const account = await fetchAccount(refreshed.value.accessToken);
  const saved = await saveTiktokConnection({
    organizationId,
    userId,
    tokens: refreshed.value,
    account: account.ok
      ? account.value
      : {
          openId: refreshed.value.openId,
          unionId: null,
          displayName: null,
          avatarUrl: null,
        },
  });
  if (!saved) {
    return null;
  }
  return { accessToken: refreshed.value.accessToken, openId: refreshed.value.openId, refreshed: true };
}

export async function deleteTiktokConnection(
  organizationId: string,
  userId: string
): Promise<boolean> {
  try {
    await db
      .delete(tiktokConnection)
      .where(
        and(
          eq(tiktokConnection.organizationId, organizationId),
          eq(tiktokConnection.userId, userId)
        )
      );
    return true;
  } catch {
    return false;
  }
}

export interface TiktokUploadView {
  publishId: string;
  fileName: string;
  fileSize: number;
  status: string;
  failReason: string | null;
  uploadedBytes: number | null;
  createdAt: Date;
}

export async function recordUpload(params: {
  organizationId: string;
  userId: string;
  publishId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
}): Promise<boolean> {
  try {
    await db
      .insert(tiktokUpload)
      .values({
        organizationId: params.organizationId,
        userId: params.userId,
        publishId: params.publishId,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        status: params.status,
      })
      .onConflictDoNothing({ target: tiktokUpload.publishId });
    return true;
  } catch {
    return false;
  }
}

export async function updateUploadStatus(params: {
  organizationId: string;
  userId: string;
  publishId: string;
  status: string;
  failReason: string | null;
  uploadedBytes: number | null;
}): Promise<boolean> {
  try {
    await db
      .update(tiktokUpload)
      .set({
        status: params.status,
        failReason: params.failReason,
        uploadedBytes: params.uploadedBytes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tiktokUpload.organizationId, params.organizationId),
          eq(tiktokUpload.userId, params.userId),
          eq(tiktokUpload.publishId, params.publishId)
        )
      );
    return true;
  } catch {
    return false;
  }
}

export async function listUploads(
  organizationId: string,
  userId: string,
  limit = 10
): Promise<TiktokUploadView[]> {
  try {
    const rows = await db
      .select({
        publishId: tiktokUpload.publishId,
        fileName: tiktokUpload.fileName,
        fileSize: tiktokUpload.fileSize,
        status: tiktokUpload.status,
        failReason: tiktokUpload.failReason,
        uploadedBytes: tiktokUpload.uploadedBytes,
        createdAt: tiktokUpload.createdAt,
      })
      .from(tiktokUpload)
      .where(
        and(
          eq(tiktokUpload.organizationId, organizationId),
          eq(tiktokUpload.userId, userId)
        )
      )
      .orderBy(desc(tiktokUpload.createdAt))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}
