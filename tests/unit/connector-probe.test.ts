import { beforeEach, describe, expect, it, vi } from "vitest";

const getConnectorSpec = vi.fn();
const verifyConnectorConnection = vi.fn();
const getGoogleConnectionHealth = vi.fn();
const getOAuthAccessToken = vi.fn();
const getIntegrationTokens = vi.fn();
const listWorkspaceIntegrations = vi.fn();
const getN8nCredentials = vi.fn();
const validateN8nCredentials = vi.fn();

vi.mock("@/lib/integrations/connectors/registry", async (importOriginal) => {
  // Keep the real spec table: token-specs.ts builds from it at import time.
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

const { probeIntegration } = await import("@/lib/integrations/connectors/probe");

beforeEach(() => {
  vi.clearAllMocks();
  getConnectorSpec.mockReturnValue(null);
  listWorkspaceIntegrations.mockResolvedValue([]);
});

describe("integration probe", () => {
  it("reports a provider with no read path as no_probe instead of a success", async () => {
    const result = await probeIntegration({ workspaceId: "ws", providerId: "plaid" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("no_probe");
  });

  it("measures a workspace's own Stripe key, not the platform account", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "rk_live_tenant" });
    const fetchMock = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify({ id: "acct_tenant", settings: { dashboard: { display_name: "Tenant Co" } } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeIntegration({ workspaceId: "ws", providerId: "stripe" });
    expect(result.ok).toBe(true);
    expect(result.account).toBe("Tenant Co");
    expect(result.detail.credential).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.stripe.com");
    vi.unstubAllGlobals();
  });

  it("labels the platform Stripe account when the workspace has no key of its own", async () => {
    getIntegrationTokens.mockResolvedValue(null);
    process.env.STRIPE_SECRET_KEY = "sk_test_platform";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ id: "acct_platform", charges_enabled: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const result = await probeIntegration({ workspaceId: "ws", providerId: "stripe" });
    expect(result.ok).toBe(true);
    // The caller can tell the tenant's account from the platform's.
    expect(result.detail.credential).toBe("platform");
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("probes Supabase with the workspace token and reads the project count", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "sbp_tenant" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ id: "ref1", region: "eu-central-1" }, { id: "ref2" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const result = await probeIntegration({ workspaceId: "ws", providerId: "supabase" });
    expect(result.ok).toBe(true);
    expect(result.account).toBe("Supabase (2 projects)");
    vi.unstubAllGlobals();
  });

  it("refuses to claim a connection when nothing is stored", async () => {
    getIntegrationTokens.mockResolvedValue(null);
    const result = await probeIntegration({ workspaceId: "ws", providerId: "instagram" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_connected");
  });

  it("names the account the provider itself returned", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "ig-token" });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "Royal Page",
          instagram_business_account: { id: "178", username: "royal_cleaning_uae" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeIntegration({ workspaceId: "ws", providerId: "instagram" });
    expect(result.ok).toBe(true);
    // The definition names the business handle, which is the identity a human recognises.
    expect(result.account).toBe("@royal_cleaning_uae");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("turns a rejected credential into unauthorized, not a silent pass", async () => {
    getIntegrationTokens.mockResolvedValue({ accessToken: "dead" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    );
    const result = await probeIntegration({ workspaceId: "ws", providerId: "instagram" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unauthorized");
    vi.unstubAllGlobals();
  });

  it("verifies a declarative connector through the executor, not a bespoke path", async () => {
    getConnectorSpec.mockReturnValue({ providerId: "slack" });
    verifyConnectorConnection.mockResolvedValue({
      ok: true,
      providerId: "slack",
      operationId: "verify",
      status: 200,
      summary: { accountName: "Zooka Workspace" },
      count: null,
    });
    const result = await probeIntegration({ workspaceId: "ws", providerId: "slack" });
    expect(result.ok).toBe(true);
    expect(result.account).toBe("Zooka Workspace");
    expect(verifyConnectorConnection).toHaveBeenCalledWith({
      workspaceId: "ws",
      providerId: "slack",
      userId: null,
    });
  });

  it("marks google as unauthorized when the stored token cannot be refreshed", async () => {
    getGoogleConnectionHealth.mockResolvedValue({
      providers: ["google_drive"],
      usable: false,
    });
    const result = await probeIntegration({ workspaceId: "ws", providerId: "google_drive" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unauthorized");
  });
});
