import { getWorkspaceConnection, getWorkspaceOAuthConnection } from "@/lib/agents/command-center";
import { decryptTokens } from "@/lib/integrations/catalog";

/**
 * Credentials for a worker run come from the workspace that owns the task.
 *
 * A single shared token would mean every tenant executes as the platform: one
 * credential, one blast radius, and no way to tell whose access was used. So the
 * lookup is per organisation and the shared environment token is only reachable
 * when a deployment explicitly declares itself single-tenant.
 *
 * A malformed stored value is refused, never repaired. Silently rewriting a secret
 * would mean the platform quietly changing what an owner stored, and it would hide
 * the very defect that made the value unusable.
 */

export type ResolvedCredential = {
  ok: true;
  token: string;
  source: "workspace" | "platform";
};

export type CredentialRefusal = {
  ok: false;
  error:
    | "not_connected"
    | "credential_missing"
    | "credential_malformed"
    | "credential_unreadable"
    | "platform_credential_not_enabled";
  detail: string;
};

const ANSI_C_QUOTED = /^\s*\$\s*'/;
const HAS_WHITESPACE_OR_QUOTES = /[\s"']/;

function inspect(raw: unknown): CredentialRefusal | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "credential_missing", detail: "The stored connection holds no access token." };
  }
  if (ANSI_C_QUOTED.test(raw) || raw.includes("$'")) {
    return {
      ok: false,
      error: "credential_malformed",
      detail:
        "The stored token is wrapped in ANSI-C quoting ($'...'). The worker will not rewrite it: correct the value where it is stored.",
    };
  }
  if (HAS_WHITESPACE_OR_QUOTES.test(raw)) {
    return {
      ok: false,
      error: "credential_malformed",
      detail: "The stored token contains whitespace or quote characters. Correct it where it is stored.",
    };
  }
  return null;
}

function pickToken(tokens: Record<string, unknown>): unknown {
  return tokens.accessToken ?? tokens.access_token ?? tokens.token ?? tokens.bearer;
}

/** Providers whose connect flow (OAuth or a pasted token) writes OAuthConnection. */
const OAUTH_STORE_PROVIDERS = new Set(["github", "vercel", "x", "meta", "linkedin"]);

/**
 * A usable token from OAuthConnection, or null so the caller falls back to the older
 * store. Expired, unreadable or malformed values are skipped, never returned.
 */
async function fromOAuthStore(
  organizationId: string,
  providerId: string,
  now: number
): Promise<ResolvedCredential | null> {
  if (!OAUTH_STORE_PROVIDERS.has(providerId)) return null;
  try {
    const row = await getWorkspaceOAuthConnection(organizationId, providerId);
    if (!row) return null;
    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= now) return null;
    const raw = pickToken(decryptTokens(row.encryptedTokens) as Record<string, unknown>);
    if (inspect(raw)) return null;
    return { ok: true, token: raw as string, source: "workspace" };
  } catch {
    return null;
  }
}

export async function resolveWorkspaceCredential(
  organizationId: string,
  providerId: string,
  now: number = Date.now()
): Promise<ResolvedCredential | CredentialRefusal> {
  const fresh = await fromOAuthStore(organizationId, providerId, now);
  if (fresh) return fresh;

  let encrypted: string | null = null;
  try {
    const row = await getWorkspaceConnection(organizationId, providerId);
    encrypted = row?.encryptedTokens ?? null;
  } catch (error) {
    // A store that cannot be read is not a store with nothing in it. Refusing here
    // is what stops a tenant silently executing as the platform.
    return {
      ok: false,
      error: "credential_unreadable",
      detail: `The connection store could not be read: ${error instanceof Error ? error.message : "unknown"}`.slice(0, 300),
    };
  }
  if (!encrypted) {
    return {
      ok: false,
      error: "not_connected",
      detail: `This workspace has no connected ${providerId} integration.`,
    };
  }
  const tokens = decryptTokens(encrypted) as Record<string, unknown>;
  const raw = pickToken(tokens);
  const problem = inspect(raw);
  if (problem) return problem;
  return { ok: true, token: raw as string, source: "workspace" };
}

/**
 * The platform's own credential, for a deployment that serves one tenant only.
 * Requires an explicit opt-in flag so multi-tenant execution cannot fall back to
 * it by accident, and is subject to the same shape checks.
 */
export function resolvePlatformCredential(
  providerId: string,
  envName: string
): ResolvedCredential | CredentialRefusal {
  if (process.env.WORKER_ALLOW_SHARED_CREDENTIAL !== "1") {
    return {
      ok: false,
      error: "platform_credential_not_enabled",
      detail: `No workspace ${providerId} connection, and shared credentials are disabled for this deployment.`,
    };
  }
  const raw = process.env[envName];
  const problem = inspect(raw);
  if (problem) return problem;
  return { ok: true, token: raw as string, source: "platform" };
}
