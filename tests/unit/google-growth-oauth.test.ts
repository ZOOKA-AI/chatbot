import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * The database module is replaced wholesale so these tests never open a
 * connection: what is under test is the OAuth logic (scopes, encrypted storage,
 * refresh, revocation, status) and the exact shape of what leaves the server.
 */
const store = new Map<string, { encryptedTokens: string; scopes: string; accountName: string | null; tokenExpiresAt: Date | null }>();

vi.mock("@/lib/db/queries", () => ({
  getGrowthOAuthConnection: async (organizationId: string) => store.get(organizationId) ?? null,
  saveGrowthOAuthConnection: async (input: {
    organizationId: string;
    encryptedTokens: string;
    scopes: string;
    accountName: string | null;
    tokenExpiresAt: Date;
  }) => {
    store.set(input.organizationId, {
      encryptedTokens: input.encryptedTokens,
      scopes: input.scopes,
      accountName: input.accountName,
      tokenExpiresAt: input.tokenExpiresAt,
    });
  },
  updateGrowthOAuthConnectionIfUnchanged: async (input: {
    organizationId: string;
    previousEncryptedTokens: string;
    encryptedTokens: string;
    tokenExpiresAt: Date;
  }) => {
    const current = store.get(input.organizationId);
    if (!current || current.encryptedTokens !== input.previousEncryptedTokens) {
      return false;
    }
    store.set(input.organizationId, {
      ...current,
      encryptedTokens: input.encryptedTokens,
      tokenExpiresAt: input.tokenExpiresAt,
    });
    return true;
  },
  deleteGrowthOAuthConnection: async (input: {
    organizationId: string;
    previousEncryptedTokens?: string;
  }) => {
    const current = store.get(input.organizationId);
    if (!current) {
      return false;
    }
    if (input.previousEncryptedTokens && current.encryptedTokens !== input.previousEncryptedTokens) {
      return false;
    }
    store.delete(input.organizationId);
    return true;
  },
}));

import {
  GOOGLE_ANALYTICS_READ_SCOPE,
  GOOGLE_GROWTH_SCOPE_STRING,
  GOOGLE_GROWTH_SCOPES,
  GOOGLE_SEARCH_CONSOLE_READ_SCOPE,
  grantedGrowthScopes,
  isGrowthTokenFresh,
  missingGrowthScopes,
} from "@/lib/integrations/google-growth/scopes";
import {
  createGrowthOAuthState,
  verifyGrowthOAuthState,
} from "@/lib/integrations/google-growth/oauth-state";
import {
  decryptGrowthTokens,
  disconnectGrowth,
  encryptGrowthTokens,
  getGrowthAccessToken,
  getGrowthConnectionStatus,
  getGrowthOAuthConfig,
  saveGrowthTokens,
} from "@/lib/integrations/google-growth/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 7).toString("base64");
const AUTH_SECRET = "test-auth-secret-value";

function configureEnv() {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_GROWTH_REDIRECT_URI =
    "https://zooka-ai.com/api/integrations/google-growth/callback";
  process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = KEY;
  process.env.AUTH_SECRET = AUTH_SECRET;
  delete process.env.GOOGLE_GROWTH_TOKEN_ENCRYPTION_KEY;
  delete process.env.GA4_PROPERTY_ID;
  delete process.env.GOOGLE_GROWTH_SA_JSON;
}

const tokens = (overrides: Partial<{ accessToken: string; refreshToken: string; expiresAt: number; scope: string }> = {}) => ({
  accessToken: overrides.accessToken ?? "ya29.access",
  refreshToken: overrides.refreshToken ?? "1//refresh",
  expiresAt: overrides.expiresAt ?? Date.now() + 3_600_000,
  scope: overrides.scope ?? GOOGLE_GROWTH_SCOPE_STRING,
});

beforeEach(() => {
  store.clear();
  configureEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("growth scopes", () => {
  test("asks for read-only analytics and search console access only", () => {
    expect([...GOOGLE_GROWTH_SCOPES]).toEqual([
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]);
    // No write scope can sneak in: anything with .edit or drive/gmail is a defect.
    for (const scope of GOOGLE_GROWTH_SCOPES) {
      expect(scope.endsWith(".readonly")).toBe(true);
      expect(scope).not.toContain(".edit");
    }
    expect(GOOGLE_GROWTH_SCOPE_STRING.split(" ")).toHaveLength(2);
  });

  test("separates granted scopes from missing ones", () => {
    const partial = `openid ${GOOGLE_ANALYTICS_READ_SCOPE}`;
    expect(grantedGrowthScopes(partial)).toEqual([GOOGLE_ANALYTICS_READ_SCOPE]);
    expect(missingGrowthScopes(partial)).toEqual([GOOGLE_SEARCH_CONSOLE_READ_SCOPE]);
    expect(grantedGrowthScopes(null)).toEqual([]);
    expect(missingGrowthScopes(undefined)).toHaveLength(2);
  });

  test("treats a token inside the skew window as expired", () => {
    expect(isGrowthTokenFresh({ expiresAt: Date.now() + 30_000 })).toBe(false);
    expect(isGrowthTokenFresh({ expiresAt: Date.now() + 600_000 })).toBe(true);
  });
});

describe("oauth state", () => {
  test("binds the state to one organization and user", () => {
    const { nonce, cookie } = createGrowthOAuthState(ORG, USER, AUTH_SECRET);
    const binding = verifyGrowthOAuthState(nonce, cookie, AUTH_SECRET);
    expect(binding).toEqual({ organizationId: ORG, userId: USER });
  });

  test("rejects a foreign secret and a swapped nonce", () => {
    const { nonce, cookie } = createGrowthOAuthState(ORG, USER, AUTH_SECRET);
    expect(verifyGrowthOAuthState(nonce, cookie, "other-secret")).toBeNull();
    expect(verifyGrowthOAuthState("different-nonce", cookie, AUTH_SECRET)).toBeNull();
  });
});

describe("token storage", () => {
  test("stores ciphertext only and round-trips it", async () => {
    const original = tokens();
    const encrypted = encryptGrowthTokens(original);
    expect(encrypted.startsWith("v1.")).toBe(true);
    for (const secret of [original.accessToken, original.refreshToken]) {
      expect(encrypted).not.toContain(secret);
    }
    expect(decryptGrowthTokens(encrypted)).toEqual(original);
  });

  test("rejects tampered ciphertext", () => {
    const encrypted = encryptGrowthTokens(tokens());
    const parts = encrypted.split(".");
    const tag = Buffer.from(parts[2], "base64");
    tag[0] = tag[0] ^ 0xff;
    parts[2] = tag.toString("base64");
    expect(() => decryptGrowthTokens(parts.join("."))).toThrow();
  });

  test("saveGrowthTokens never writes a plaintext token", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens(), accountName: "Workspace" });
    const row = store.get(ORG);
    expect(row).toBeTruthy();
    expect(row?.encryptedTokens.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(row)).not.toContain("ya29.access");
  });
});

describe("access token resolution", () => {
  test("returns a fresh token without calling Google", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens() });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getGrowthAccessToken(ORG)).toBe("ya29.access");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("refreshes an expired token and persists the new one", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens({ expiresAt: Date.now() - 1000 }) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "ya29.fresh", expires_in: 3599, scope: GOOGLE_GROWTH_SCOPE_STRING }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    expect(await getGrowthAccessToken(ORG)).toBe("ya29.fresh");
    expect(decryptGrowthTokens(store.get(ORG)?.encryptedTokens as string).accessToken).toBe("ya29.fresh");
  });

  test("deletes the connection when Google reports a revoked grant", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens({ expiresAt: Date.now() - 1000 }) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      )
    );
    expect(await getGrowthAccessToken(ORG)).toBeNull();
    expect(store.has(ORG)).toBe(false);
  });

  test("keeps the connection when the failure is our own misconfiguration", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens({ expiresAt: Date.now() - 1000 }) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_client" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )
    );
    expect(await getGrowthAccessToken(ORG)).toBeNull();
    expect(store.has(ORG)).toBe(true);
  });
});

describe("connection status", () => {
  test("is honest when nothing is connected", async () => {
    const status = await getGrowthConnectionStatus(ORG);
    expect(status).toMatchObject({ configured: true, connected: false, usable: false, reason: "not_connected" });
  });

  test("reports missing scopes instead of claiming success", async () => {
    await saveGrowthTokens({
      organizationId: ORG,
      tokens: tokens({ scope: GOOGLE_ANALYTICS_READ_SCOPE }),
    });
    const status = await getGrowthConnectionStatus(ORG);
    expect(status.connected).toBe(true);
    expect(status.reason).toBe("missing_scopes");
    expect(status.missingScopes).toEqual([GOOGLE_SEARCH_CONSOLE_READ_SCOPE]);
    expect(status.usable).toBe(false);
  });

  test("never exposes a token in the status object", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens() });
    vi.stubGlobal("fetch", vi.fn());
    const status = await getGrowthConnectionStatus(ORG);
    expect(status.usable).toBe(true);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("ya29.access");
    expect(serialized).not.toContain("1//refresh");
    expect(serialized).not.toContain("v1.");
  });
});

describe("disconnect", () => {
  test("revokes at Google and removes the local ciphertext", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens() });
    const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await disconnectGrowth(ORG);
    expect(result).toEqual({ revoked: true, disconnected: true });
    expect(store.has(ORG)).toBe(false);
    const called = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(called[0]).toBe("https://oauth2.googleapis.com/revoke");
  });

  test("still removes local access when Google is unreachable", async () => {
    await saveGrowthTokens({ organizationId: ORG, tokens: tokens() });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const result = await disconnectGrowth(ORG);
    expect(result).toEqual({ revoked: false, disconnected: true });
    expect(store.has(ORG)).toBe(false);
  });
});

describe("configuration guard", () => {
  test("returns null config when the redirect path is not the growth callback", () => {
    process.env.GOOGLE_GROWTH_REDIRECT_URI =
      "https://zooka-ai.com/api/integrations/google-drive/callback";
    expect(getGrowthOAuthConfig()).toBeNull();
  });

  test("returns null config when the encryption key is not 32-byte base64", () => {
    process.env.GOOGLE_GROWTH_REDIRECT_URI =
      "https://zooka-ai.com/api/integrations/google-growth/callback";
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(getGrowthOAuthConfig()).toBeNull();
  });
});

describe("traffic snapshot without credentials", () => {
  test("reports the missing property id rather than inventing numbers", async () => {
    const { getTrafficSnapshot } = await import("@/lib/analytics/growth");
    const snapshot = await getTrafficSnapshot();
    assert.equal(snapshot.configured, false);
    expect(snapshot.reason).toBe("missing_property_id");
    expect(snapshot.ga4).toBeUndefined();
  });

  test("reports both missing paths for a workspace with no grant", async () => {
    process.env.GA4_PROPERTY_ID = "563695686";
    const { getTrafficSnapshotForOrganization } = await import("@/lib/analytics/growth");
    const snapshot = await getTrafficSnapshotForOrganization(ORG);
    expect(snapshot.configured).toBe(false);
    expect(snapshot.reason).toBe("no_connection_and_no_service_account");
    delete process.env.GA4_PROPERTY_ID;
  });
});
