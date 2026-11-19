import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { n8nConnection } from "@/lib/db/schema";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
} from "@/lib/integrations/google-drive/crypto";

export type N8nCredentials = {
  baseUrl: string;
  apiKey: string;
};

function getEncryptionKey(): string | null {
  const key =
    process.env.TOKEN_ENCRYPTION_KEY ??
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  return key ?? null;
}

/** Normalizes user input into a bare origin, e.g. "https://x.app.n8n.cloud". */
export function normalizeN8nBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function saveN8nCredentials(
  organizationId: string,
  credentials: N8nCredentials
): Promise<boolean> {
  const key = getEncryptionKey();
  if (!key) {
    return false;
  }
  const encrypted = encryptGoogleDriveTokens(JSON.stringify(credentials), key);
  try {
    await db
      .insert(n8nConnection)
      .values({ organizationId, encryptedCredentials: encrypted })
      .onConflictDoUpdate({
        target: n8nConnection.organizationId,
        set: { encryptedCredentials: encrypted, updatedAt: new Date() },
      });
    return true;
  } catch {
    // Table missing or unreachable: surface as a storage problem, never a crash.
    return false;
  }
}

export async function getN8nCredentials(
  organizationId: string
): Promise<N8nCredentials | null> {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }
  let row: { encryptedCredentials: string } | undefined;
  try {
    [row] = await db
      .select()
      .from(n8nConnection)
      .where(eq(n8nConnection.organizationId, organizationId))
      .limit(1);
  } catch {
    return null;
  }
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(
      decryptGoogleDriveTokens(row.encryptedCredentials, key)
    ) as N8nCredentials;
  } catch {
    return null;
  }
}

export async function deleteN8nCredentials(
  organizationId: string
): Promise<void> {
  try {
    await db
      .delete(n8nConnection)
      .where(eq(n8nConnection.organizationId, organizationId));
  } catch {
    // nothing stored yet
  }
}

export async function isN8nConnected(organizationId: string): Promise<boolean> {
  return (await getN8nCredentials(organizationId)) !== null;
}
