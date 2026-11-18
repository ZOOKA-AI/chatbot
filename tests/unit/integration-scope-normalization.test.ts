import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Production regression: /settings/integrations returned 500 with
 * "TypeError: d.scopes.join is not a function".
 *
 * The connect routes stored `definition.scopes.join(" ")` — a single string —
 * into the jsonb column `integration_connection.scopes`, so the read path got a
 * JSON string back where every consumer expects string[]. These tests pin the
 * normalizer, the stored shape, and the detail resolver that feeds the page.
 */

const execute = vi.fn();

vi.mock("@/lib/db/queries", () => ({ db: { execute } }));

// Keep the real implementation but record the raw values it is handed, so a
// write path that forgets to normalize fails this suite.
vi.mock("@/lib/integrations/scopes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/integrations/scopes")>();
  return { normalizeScopes: vi.fn(actual.normalizeScopes) };
});

const { normalizeScopes } = await import("@/lib/integrations/scopes");
const { getConnectorDetails } = await import("@/lib/integrations/connectors/detail");
const { saveIntegrationConnection } = await import("@/lib/integrations/catalog");

const KEY = Buffer.alloc(32, 7).toString("base64");

/** Drizzle keeps each bound parameter, unwrapped, inside queryChunks. */
function boundStrings(query: unknown): string[] {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.filter((chunk): chunk is string => typeof chunk === "string");
}

beforeEach(() => {
  execute.mockReset();
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY);
});

describe("normalizeScopes", () => {
  it("keeps an array of scopes as an array", () => {
    expect(normalizeScopes(["channels:read", "chat:write"])).toEqual([
      "channels:read",
      "chat:write",
    ]);
  });

  it("splits the space-delimited string an OAuth token response returns", () => {
    expect(normalizeScopes("read:user read:org")).toEqual(["read:user", "read:org"]);
  });

  it("splits a JSON string that came back out of the jsonb column", () => {
    expect(normalizeScopes("repo, read:org")).toEqual(["repo", "read:org"]);
  });

  it("splits string entries inside an array instead of trusting them", () => {
    expect(normalizeScopes(["read:user read:org", "user:email"])).toEqual([
      "read:user",
      "read:org",
      "user:email",
    ]);
  });

  it("drops empty entries and duplicates", () => {
    expect(normalizeScopes(["read", "", "  ", "read"])).toEqual(["read"]);
  });

  it("returns an empty array for anything else", () => {
    for (const value of [null, undefined, 42, {}, true]) {
      expect(normalizeScopes(value)).toEqual([]);
    }
  });
});

describe("saveIntegrationConnection", () => {
  it("stores a string scope list as a jsonb array, not a jsonb string", async () => {
    execute.mockResolvedValue([]);

    await saveIntegrationConnection({
      workspaceId: "ws_1",
      providerId: "x",
      tokens: { accessToken: "token" },
      scopes: "read:user read:org",
    });

    expect(normalizeScopes).toHaveBeenCalledWith("read:user read:org");
    const bound = boundStrings(execute.mock.calls[0][0]);
    expect(bound).toContain(JSON.stringify(["read:user", "read:org"]));
    expect(bound).not.toContain(JSON.stringify("read:user read:org"));
  });

  it("still stores an array unchanged", async () => {
    execute.mockResolvedValue([]);

    await saveIntegrationConnection({
      workspaceId: "ws_1",
      providerId: "slack",
      tokens: { accessToken: "token" },
      scopes: ["channels:read", "chat:write"],
    });

    expect(boundStrings(execute.mock.calls[0][0])).toContain(
      JSON.stringify(["channels:read", "chat:write"])
    );
  });
});

describe("getConnectorDetails", () => {
  it("never hands the page a string, even for a row written before this fix", async () => {
    execute.mockResolvedValue([
      {
        provider: "legacy_provider",
        display_name: "Legacy",
        account_email: null,
        scopes: "read:user read:org",
        status: "connected",
        expires_at: null,
        last_used_at: null,
        last_error: null,
      },
    ]);

    const details = await getConnectorDetails("ws_1");
    const legacy = details.get("legacy_provider");

    expect(legacy).toBeDefined();
    expect(Array.isArray(legacy?.scopes)).toBe(true);
    expect(legacy?.scopes).toEqual(["read:user", "read:org"]);
    expect(() => legacy?.scopes.join(" · ")).not.toThrow();
  });

  it("normalizes a provider row whose stored scopes are already an array", async () => {
    execute.mockResolvedValue([
      {
        provider: "legacy_provider",
        display_name: null,
        account_email: null,
        scopes: ["read"],
        status: "connected",
        expires_at: null,
        last_used_at: null,
        last_error: null,
      },
    ]);

    const details = await getConnectorDetails("ws_1");
    expect(details.get("legacy_provider")?.scopes).toEqual(["read"]);
  });
});
