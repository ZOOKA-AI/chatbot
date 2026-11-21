import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Three defects seen live on 2026-11-21 (tasks 235f9f97 and 30966ef8):
 *  1. reconnecting GitHub wrote OAuthConnection, the worker read only the older
 *     integration_connection row, so every task kept failing with github_401;
 *  2. a task whose form sent no tool ran github_repo_inspect even when its text asked
 *     for workspace_readiness_inspect;
 *  3. the assigned agent was ignored: the scheduler took whichever agent came first.
 */

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  oauth: null as null | { encryptedTokens: string; tokenExpiresAt: Date | null },
  legacy: null as null | { encryptedTokens: string },
  oauthThrows: false,
}));

vi.mock("@/lib/agents/command-center", () => ({
  getWorkspaceOAuthConnection: async () => {
    if (store.oauthThrows) throw new Error("permission denied");
    return store.oauth;
  },
  getWorkspaceConnection: async () => store.legacy,
  agentIdentityForTask: async () => null,
}));

// "Encrypted" values in these tests are plain JSON: the cipher is covered elsewhere.
vi.mock("@/lib/integrations/catalog", () => ({
  decryptTokens: (value: string) => JSON.parse(value),
}));

vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used");
  },
}));

import { toolForTask } from "@/lib/agents/scheduler";
import { resolveWorkspaceCredential } from "@/lib/agents/worker-credentials";

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-21T16:00:00Z");

beforeEach(() => {
  store.oauth = null;
  store.legacy = null;
  store.oauthThrows = false;
});

describe("worker credentials read both stores, OAuth first", () => {
  it("uses the token the connect flow just wrote, not the stale legacy row", async () => {
    store.oauth = { encryptedTokens: JSON.stringify({ accessToken: "gho_fresh" }), tokenExpiresAt: null };
    store.legacy = { encryptedTokens: JSON.stringify({ accessToken: "ghp_dead" }) };
    expect(await resolveWorkspaceCredential(ORG, "github", NOW)).toEqual({
      ok: true,
      token: "gho_fresh",
      source: "workspace",
    });
  });

  it("falls back to the legacy row when the OAuth token has expired", async () => {
    store.oauth = {
      encryptedTokens: JSON.stringify({ accessToken: "gho_expired" }),
      tokenExpiresAt: new Date("2026-11-19T00:00:00Z"),
    };
    store.legacy = { encryptedTokens: JSON.stringify({ accessToken: "ghp_legacy" }) };
    expect(await resolveWorkspaceCredential(ORG, "github", NOW)).toMatchObject({ ok: true, token: "ghp_legacy" });
  });

  it("falls back when the OAuth store is unreadable or holds a malformed token", async () => {
    store.legacy = { encryptedTokens: JSON.stringify({ accessToken: "ghp_legacy" }) };
    store.oauthThrows = true;
    expect(await resolveWorkspaceCredential(ORG, "github", NOW)).toMatchObject({ token: "ghp_legacy" });
    store.oauthThrows = false;
    store.oauth = { encryptedTokens: JSON.stringify({ accessToken: "has space" }), tokenExpiresAt: null };
    expect(await resolveWorkspaceCredential(ORG, "github", NOW)).toMatchObject({ token: "ghp_legacy" });
  });

  it("still refuses when neither store has a connection", async () => {
    expect(await resolveWorkspaceCredential(ORG, "github", NOW)).toMatchObject({ ok: false, error: "not_connected" });
  });

  it("does not consult OAuthConnection for providers it never stores", async () => {
    store.oauth = { encryptedTokens: JSON.stringify({ accessToken: "should_not_be_used" }), tokenExpiresAt: null };
    store.legacy = { encryptedTokens: JSON.stringify({ accessToken: "slack_token" }) };
    expect(await resolveWorkspaceCredential(ORG, "slack", NOW)).toMatchObject({ token: "slack_token" });
  });
});

describe("the tool a task runs", () => {
  const config = { tool: "github_repo_inspect" } as never;
  const task = (over: Record<string, unknown>) =>
    ({ id: "t", organizationId: ORG, createdAt: new Date(), payload: null, ...over }) as never;

  it("keeps a declared payload tool", () => {
    expect(toolForTask(task({ payload: { tool: "vercel_deployment_inspect" } }), config)).toBe(
      "vercel_deployment_inspect"
    );
  });

  it("takes the tool the text names instead of defaulting to GitHub", () => {
    expect(
      toolForTask(task({ title: "اختبار 1", instruction: "استخدم workspace_readiness_inspect فقط" }), config)
    ).toBe("workspace_readiness_inspect");
  });

  it("takes the first tool named when several are", () => {
    expect(
      toolForTask(
        task({ instruction: "1) studio_asset_list ثم 2) project_document_create" }),
        config
      )
    ).toBe("studio_asset_list");
  });

  it("falls back to the configured tool when the text names none or an unknown one", () => {
    expect(toolForTask(task({ instruction: "لخّص الحالة" }), config)).toBe("github_repo_inspect");
    expect(toolForTask(task({ payload: { tool: "rm_rf" }, instruction: "x" }), config)).toBe("github_repo_inspect");
  });
});
