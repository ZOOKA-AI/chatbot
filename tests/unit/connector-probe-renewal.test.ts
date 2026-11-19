import { beforeEach, describe, expect, it, vi } from "vitest";

const getConnectorSpec = vi.fn();
const verifyConnectorConnection = vi.fn();
const getGoogleConnectionHealth = vi.fn();
const getOAuthAccessToken = vi.fn();
const getIntegrationTokens = vi.fn();
const listWorkspaceIntegrations = vi.fn();
const getN8nCredentials = vi.fn();
const validateN8nCredentials = vi.fn();
const renewProviderToken = vi.fn();

vi.mock("@/lib/integrations/connectors/registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/integrations/connectors/registry")>();
  return { ...actual, getConnectorSpec };
});
vi.mock("@/lib/integrations/connectors/execute", () => ({ verifyConnectorConnection }));
vi.mock("@/lib/integrations/google-drive/server", () => ({ getGoogleConnectionHealth }));
vi.mock("@/lib/integrations/oauth/store", () => ({ getOAuthAccessToken }));
vi.mock("@/lib/integrations/catalog", () => ({ getIntegrationTokens, listWorkspaceIntegrations }));
vi.mock("@/lib/integrations/n8n/store", () => ({ getN8nCredentials }));
vi.mock("@/lib/integrations/n8n/server", () => ({ validateN8nCredentials }));
vi.mock("@/lib/integrations/connectors/token-refresh", () => ({ renewProviderToken }));

const { probeIntegration } = await import("@/lib/integrations/connectors/probe");

const snapPayload = {
  organizations: [
    { organization: { id: "org-1", name: "Royalharoon.com" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getConnectorSpec.mockReturnValue(null);
  listWorkspaceIntegrations.mockResolvedValue([]);
});

describe("pasted-token probe renewal", () => {
  it("renews an expired access token instead of reporting the connection as broken", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "expired-access|refresh-half" });
    renewProviderToken.mockResolvedValue("fresh-access");
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        const auth = String(headers.authorization ?? headers.Authorization ?? "");
        seen.push(auth);
        if (auth.includes("expired-access")) {
          return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
        }
        return new Response(JSON.stringify(snapPayload), { status: 200 });
      })
    );

    const result = await probeIntegration({ workspaceId: "ws", providerId: "snapchat" });

    expect(result.ok).toBe(true);
    expect(result.account).toBe("Royalharoon.com");
    expect(result.detail.renewed).toBe(true);
    expect(renewProviderToken).toHaveBeenCalledWith("snapchat", "ws");
    expect(seen).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("still reports unauthorized when no refresh half can renew the token", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "dead-access" });
    renewProviderToken.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
    );

    const result = await probeIntegration({ workspaceId: "ws", providerId: "snapchat" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("unauthorized");
    expect(renewProviderToken).toHaveBeenCalledWith("snapchat", "ws");
    vi.unstubAllGlobals();
  });

  it("does not renew a token that is already working", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "live-access" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(snapPayload), { status: 200 }))
    );

    const result = await probeIntegration({ workspaceId: "ws", providerId: "snapchat" });

    expect(result.ok).toBe(true);
    expect(result.detail.renewed).toBeUndefined();
    expect(renewProviderToken).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
