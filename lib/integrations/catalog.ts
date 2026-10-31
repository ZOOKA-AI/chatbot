import "server-only";

import { sql } from "drizzle-orm";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
} from "@/lib/integrations/google-drive/crypto";
import { db } from "@/lib/db/queries";

/**
 * Shared integration layer for every provider (Gmail, Drive, Meta, TikTok,
 * n8n, banks, ...). Provider metadata lives in `integration_provider`, the
 * per-workspace secrets in `integration_connection` (AES-256-GCM, same
 * envelope as the Google Drive connection: v1.<nonce>.<tag>.<ciphertext>),
 * and every action is appended to `integration_audit`.
 */

export type ProviderStatus = "available" | "beta" | "coming_soon";

export type IntegrationProvider = {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  description: string | null;
  descriptionAr: string | null;
  authType: string;
  scopes: string[];
  status: ProviderStatus;
  isManaged: boolean;
  capabilities: string[];
  docsUrl: string | null;
  sortOrder: number;
};

export type WorkspaceIntegration = {
  providerId: string;
  displayName: string | null;
  accountEmail: string | null;
  scopes: string[];
  status: "connected" | "expired" | "error" | "revoked";
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastError: string | null;
};

export type IntegrationTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string | number | null;
  tokenType?: string;
  scope?: string;
  [key: string]: unknown;
};

function encryptionKey() {
  const key =
    process.env.TOKEN_ENCRYPTION_KEY ??
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  return key;
}

export function encryptTokens(tokens: IntegrationTokens) {
  return encryptGoogleDriveTokens(JSON.stringify(tokens), encryptionKey());
}

export function decryptTokens(value: string): IntegrationTokens {
  return JSON.parse(
    decryptGoogleDriveTokens(value, encryptionKey())
  ) as IntegrationTokens;
}

export async function listProviderCatalog(): Promise<IntegrationProvider[]> {
  const rows = (await db.execute(sql`
    select id, name, name_ar, category, description, description_ar,
           auth_type, scopes, status, is_managed, capabilities, docs_url,
           sort_order
    from integration_provider
    order by sort_order asc, name asc
  `)) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    nameAr: row.name_ar as string,
    category: row.category as string,
    description: (row.description as string) ?? null,
    descriptionAr: (row.description_ar as string) ?? null,
    authType: row.auth_type as string,
    scopes: (row.scopes as string[]) ?? [],
    status: row.status as ProviderStatus,
    isManaged: Boolean(row.is_managed),
    capabilities: (row.capabilities as string[]) ?? [],
    docsUrl: (row.docs_url as string) ?? null,
    sortOrder: Number(row.sort_order ?? 100),
  }));
}

export async function listWorkspaceIntegrations(
  workspaceId: string
): Promise<WorkspaceIntegration[]> {
  const rows = (await db.execute(sql`
    select provider, display_name, account_email, scopes, status, expires_at,
           last_used_at, last_error
    from integration_connection
    where workspace_id = ${workspaceId} and revoked_at is null
    order by provider asc
  `)) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    providerId: row.provider as string,
    displayName: (row.display_name as string) ?? null,
    accountEmail: (row.account_email as string) ?? null,
    scopes: (row.scopes as string[]) ?? [],
    status: row.status as WorkspaceIntegration["status"],
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : null,
    lastError: (row.last_error as string) ?? null,
  }));
}

export async function saveIntegrationConnection(input: {
  workspaceId: string;
  providerId: string;
  tokens: IntegrationTokens;
  scopes?: string[];
  accountEmail?: string | null;
  displayName?: string | null;
  connectedBy?: string | null;
  expiresAt?: Date | null;
}) {
  const encrypted = encryptTokens(input.tokens);
  const expiresAt =
    input.expiresAt ??
    (input.tokens.expiresAt ? new Date(input.tokens.expiresAt as string) : null);
  await db.execute(sql`
    insert into integration_connection
      (workspace_id, provider, provider_id, display_name, account_email, scopes,
       encrypted_tokens, expires_at, status, connected_by, revoked_at)
    values
      (${input.workspaceId}, ${input.providerId}, ${input.providerId},
       ${input.displayName ?? null}, ${input.accountEmail ?? null},
       ${JSON.stringify(input.scopes ?? [])}::jsonb, ${encrypted},
       ${expiresAt}, 'connected', ${input.connectedBy ?? null}, null)
    on conflict (workspace_id, provider) do update set
      encrypted_tokens = excluded.encrypted_tokens,
      scopes = excluded.scopes,
      account_email = coalesce(excluded.account_email, integration_connection.account_email),
      display_name = coalesce(excluded.display_name, integration_connection.display_name),
      expires_at = excluded.expires_at,
      status = 'connected',
      revoked_at = null,
      last_error = null,
      updated_at = now()
  `);
  await appendAudit({
    workspaceId: input.workspaceId,
    providerId: input.providerId,
    action: "connected",
    userId: input.connectedBy ?? null,
  });
}

export async function getIntegrationTokens(
  workspaceId: string,
  providerId: string
): Promise<IntegrationTokens | null> {
  const rows = (await db.execute(sql`
    select encrypted_tokens, status
    from integration_connection
    where workspace_id = ${workspaceId}
      and provider = ${providerId}
      and revoked_at is null
    limit 1
  `)) as unknown as Record<string, unknown>[];
  const row = (rows as Record<string, unknown>[])[0];
  if (!row || row.status === "revoked") {
    return null;
  }
  await db.execute(sql`
    update integration_connection set last_used_at = now()
    where workspace_id = ${workspaceId} and provider = ${providerId}
  `);
  return decryptTokens(row.encrypted_tokens as string);
}

export async function markConnectionError(
  workspaceId: string,
  providerId: string,
  message: string
) {
  await db.execute(sql`
    update integration_connection
    set status = 'error', last_error = ${message.slice(0, 500)}, updated_at = now()
    where workspace_id = ${workspaceId} and provider = ${providerId}
  `);
}

export async function disconnectIntegration(
  workspaceId: string,
  providerId: string,
  userId?: string | null
) {
  await db.execute(sql`
    update integration_connection
    set status = 'revoked', revoked_at = now(), encrypted_tokens = '',
        updated_at = now()
    where workspace_id = ${workspaceId} and provider = ${providerId}
  `);
  await appendAudit({
    workspaceId,
    providerId,
    action: "disconnected",
    userId: userId ?? null,
  });
}

export async function recordIntegrationUsage(
  workspaceId: string,
  metric: string,
  amount = 1
) {
  await db.execute(sql`
    insert into usage_counter (workspace_id, metric, period_start, used)
    values (${workspaceId}, ${metric}, date_trunc('month', now())::date, ${amount})
    on conflict (workspace_id, metric, period_start) do update set
      used = usage_counter.used + ${amount}, updated_at = now()
  `);
}

export async function appendAudit(input: {
  workspaceId: string;
  providerId: string;
  action: string;
  userId?: string | null;
  detail?: unknown;
}) {
  await db.execute(sql`
    insert into integration_audit (workspace_id, user_id, provider, action, detail)
    values (${input.workspaceId}, ${input.userId ?? null}, ${input.providerId},
            ${input.action}, ${JSON.stringify(input.detail ?? {})}::jsonb)
  `);
}
