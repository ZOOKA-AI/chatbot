import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import {
  googleDriveConnection,
  integrationCheck,
  n8nConnection,
  oauthConnection,
} from "@/lib/db/schema";
import { decryptGoogleDriveTokens } from "@/lib/integrations/google-drive/crypto";
import { isGoogleDriveConfigured } from "@/lib/integrations/google-drive/server";
import {
  GOOGLE_GMAIL_SCOPE,
  googleProvidersForScopes,
} from "@/lib/integrations/google-drive/token-response";
import {
  isOAuthProviderConfigured,
  isOAuthProviderId,
} from "@/lib/integrations/oauth/config";
import { connectionState, hubProviders, type Verification } from "./catalog";
import { probeCredential } from "./probe";

export async function hubCredentials(organizationId: string) {
  // Do not swallow a DB error as "not connected". Caller reports service unavailable.
  const oauth = await db
    .select()
    .from(oauthConnection)
    .where(eq(oauthConnection.organizationId, organizationId));
  const google = await db
    .select()
    .from(googleDriveConnection)
    .where(eq(googleDriveConnection.organizationId, organizationId));
  const n8n = await db
    .select()
    .from(n8nConnection)
    .where(eq(n8nConnection.organizationId, organizationId));
  const map = new Map<
    string,
    {
      encrypted: string;
      version: string;
      expired: boolean;
      account: string | null;
      scopes: string[];
    }
  >();
  for (const row of oauth) {
    map.set(row.provider, {
      encrypted: row.encryptedTokens,
      version: row.encryptedTokens,
      expired: Boolean(
        row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()
      ),
      account: row.accountName,
      scopes: row.scopes?.split(/\s+/) ?? [],
    });
  }
  if (google[0]) {
    const key = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
    if (key) {
      try {
        const bundle: unknown = JSON.parse(
          decryptGoogleDriveTokens(google[0].encryptedTokens, key)
        );
        if (
          bundle &&
          typeof bundle === "object" &&
          "scope" in bundle &&
          typeof bundle.scope === "string"
        ) {
          const providers = googleProvidersForScopes(bundle.scope);
          if (
            bundle.scope.split(/\s+/).includes(GOOGLE_GMAIL_SCOPE) &&
            !providers.includes("gmail")
          ) {
            providers.push("gmail");
          }
          for (const provider of providers) {
            map.set(provider, {
              encrypted: google[0].encryptedTokens,
              version: google[0].connectionId,
              expired:
                "expiresAt" in bundle &&
                typeof bundle.expiresAt === "number" &&
                bundle.expiresAt <= Date.now(),
              account: null,
              scopes: bundle.scope.split(/\s+/),
            });
          }
        }
      } catch {
        map.set("google_drive", {
          encrypted: google[0].encryptedTokens,
          version: google[0].connectionId,
          expired: true,
          account: null,
          scopes: [],
        });
      }
    }
  }
  if (n8n[0]) {
    map.set("n8n", {
      encrypted: n8n[0].encryptedCredentials,
      version: n8n[0].encryptedCredentials,
      expired: false,
      account: null,
      scopes: [],
    });
  }
  return map;
}
const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function configured(id: string) {
  if (isOAuthProviderId(id)) {
    return isOAuthProviderConfigured(id);
  }
  if (["google_drive", "gmail", "google_calendar"].includes(id)) {
    return isGoogleDriveConfigured();
  }
  if (id === "gateway_image") {
    return (
      process.env.MEDIA_ENGINE_PROVIDER === "ai-gateway" &&
      Boolean(process.env.BLOB_READ_WRITE_TOKEN)
    );
  }
  // No platform-wide database/payment/model key is treated as a user's connected account.
  return false;
}
export async function readHub(organizationId: string) {
  const credentials = await hubCredentials(organizationId);
  const checks = await db
    .select()
    .from(integrationCheck)
    .where(eq(integrationCheck.organizationId, organizationId));
  return hubProviders.map((provider) => {
    const stored = credentials.get(provider.id);
    const check = checks.find((item) => item.provider === provider.id);
    const verification = check
      ? {
          state: check.state as Verification["state"],
          code: check.code,
          checkedAt: check.checkedAt.toISOString(),
          fingerprint: check.fingerprint,
        }
      : null;
    const state = connectionState({
      configured: configured(provider.id),
      stored: Boolean(stored),
      expired: stored?.expired ?? false,
      fingerprint: stored ? fingerprint(stored.version) : "",
      verification,
    });
    return {
      ...provider,
      state,
      account: stored?.account ?? null,
      grantedScopes: stored?.scopes ?? [],
      checkedAt: check?.checkedAt.toISOString() ?? null,
      code: check?.code ?? null,
    };
  });
}
export async function testHub(organizationId: string, provider: string) {
  const stored = (await hubCredentials(organizationId)).get(provider);
  if (!stored) {
    return { state: "ERROR", code: "NO_WORKSPACE_CREDENTIAL", checkedAt: null };
  }
  const hash = fingerprint(stored.version);
  const admitted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${provider}`},0))`
    );
    const [previous] = await tx
      .select()
      .from(integrationCheck)
      .where(
        and(
          eq(integrationCheck.organizationId, organizationId),
          eq(integrationCheck.provider, provider)
        )
      );
    if (previous && Date.now() - previous.checkedAt.getTime() < 60_000) {
      return false;
    }
    const value = {
      organizationId,
      provider,
      fingerprint: hash,
      state: "ERROR",
      code: "CHECK_IN_PROGRESS",
      checkedAt: new Date(),
    };
    await tx
      .insert(integrationCheck)
      .values(value)
      .onConflictDoUpdate({
        target: [integrationCheck.organizationId, integrationCheck.provider],
        set: value,
      });
    return true;
  });
  if (!admitted) {
    return { state: "ERROR", code: "CHECK_RATE_LIMIT", checkedAt: null };
  }
  let token: string | null = null;
  // Probe only the stored access token. Do not refresh/revoke/delete a grant
  // just because a health-test button was pressed.
  const googleProvider = ["google_drive", "gmail", "google_calendar"].includes(
    provider
  );
  const key = googleProvider
    ? process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
    : (process.env.TOKEN_ENCRYPTION_KEY ??
      process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY);
  if (key) {
    try {
      const bundle: unknown = JSON.parse(
        decryptGoogleDriveTokens(stored.encrypted, key)
      );
      if (
        bundle &&
        typeof bundle === "object" &&
        "accessToken" in bundle &&
        typeof bundle.accessToken === "string"
      ) {
        token = bundle.accessToken;
      }
    } catch {
      /* fail closed without changing credentials */
    }
  }
  const result = token
    ? await probeCredential(provider, token)
    : { state: "EXPIRED" as const, code: "CREDENTIAL_UNAVAILABLE" };
  const checkedAt = new Date();
  await db
    .update(integrationCheck)
    .set({ ...result, checkedAt, fingerprint: hash })
    .where(
      and(
        eq(integrationCheck.organizationId, organizationId),
        eq(integrationCheck.provider, provider)
      )
    );
  return { ...result, checkedAt: checkedAt.toISOString() };
}
