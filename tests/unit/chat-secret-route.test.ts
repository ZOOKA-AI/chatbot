import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  create: vi.fn(),
  saveChat: vi.fn(),
  saveMessages: vi.fn(),
  updateMessage: vi.fn(),
  title: vi.fn(),
  model: vi.fn(),
  chat: vi.fn(),
  prior: vi.fn(),
  writes: [] as unknown[],
  streams: [] as unknown[],
}));

vi.mock("@vercel/functions", () => ({ geolocation: () => ({}), ipAddress: () => "127.0.0.1" }));
vi.mock("botid/server", () => ({ checkBotId: async () => ({ isBot: false }) }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<object>(), after: () => {} }));
vi.mock("@/lib/db/request-tenant", () => ({ withRequestTenantHandler: (fn: unknown) => fn }));
vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: async () => ({
    organizationId: "org-1", role: "owner", user: { id: "user-1" },
    session: { user: { id: "user-1", type: "regular" } },
  }),
}));
vi.mock("@/lib/db/workspace-secrets", () => ({
  getWorkspaceSecretDetectionEnabled: mocks.enabled,
  createWorkspaceSecret: mocks.create,
}));
vi.mock("@/lib/db/queries", () => ({
  getWorkspaceBilling: async () => ({ subscription: null, usage: { agentRuns: 0 } }),
  getMessageCountByUserId: async () => 0,
  getChatById: mocks.chat,
  getMessagesByChatId: mocks.prior,
  saveChat: mocks.saveChat,
  saveMessages: mocks.saveMessages,
  updateMessage: mocks.updateMessage,
  updateChatTitleById: vi.fn(),
  createStreamId: vi.fn(),
  deleteChatById: vi.fn(),
  trackWorkspaceUsage: vi.fn(),
}));
vi.mock("@/lib/saas/entitlements", () => ({ getWorkspaceEntitlements: async () => ({ canUseAgentMode: false, plan: "free" }) }));
vi.mock("@/lib/saas/quota", () => ({ checkQuota: async () => ({ allowed: true }), recordUsage: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ checkIpRateLimit: async () => {} }));
vi.mock("@/lib/i18n", () => ({ getLang: async () => "en" }));
vi.mock("@/lib/ai/models", () => ({
  allowedModelIds: new Set(["chat-model"]),
  paidModelIds: new Set(),
  modelSupportsTools: () => false,
}));
vi.mock("@/lib/ai/model-availability", () => ({ unavailableModelIds: () => [] }));
vi.mock("@/lib/ai/provider-diagnostics", () => ({
  getMissingModelProviderMessage: () => null,
  describeModelProviderFailure: () => "error",
  logModelProviderFailure: vi.fn(),
}));
vi.mock("@/lib/ai/generate-chat-title", () => ({ generateChatTitle: mocks.title }));
vi.mock("@/lib/ai/private-image-messages", () => ({ resolvePrivateImageMessages: async (messages: unknown) => messages }));
vi.mock("@/lib/ai/providers", () => ({ getLanguageModel: () => ({}) }));
vi.mock("@/lib/ai/tracing", () => ({
  createChatTracing: () => ({ flush: () => {}, streamText: mocks.model }),
}));
vi.mock("@/lib/db/agent-memory", () => ({ listAgentMemories: async () => [] }));
vi.mock("@/lib/db/tenant-client", () => ({ runAfterResponseInTenant: async (_: unknown, fn: () => unknown) => fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    convertToModelMessages: async (messages: unknown) => messages,
    createUIMessageStream: (config: unknown) => { mocks.streams.push(config); return config; },
    createUIMessageStreamResponse: async ({ stream }: { stream: { execute: (arg: unknown) => Promise<void> } }) => {
      await stream.execute({ writer: { write: (data: unknown) => mocks.writes.push(data), merge: () => {} } });
      return new Response("ok");
    },
  };
});

const id = "3f6a1d2e-4b5c-4d7e-8f90-1a2b3c4d5e6f";
const secret = ["gh", "p_", "a".repeat(36)].join("");
const message = () => ({ id, role: "user", parts: [{ type: "text", text: `hello ${secret}` }] });
const post = (body: object) => new Request("https://example.test/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id, selectedChatModel: "chat-model", selectedVisibilityType: "private", ...body }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writes.length = 0;
  mocks.streams.length = 0;
  mocks.enabled.mockResolvedValue(true);
  mocks.create.mockResolvedValue({ id: "secret" });
  mocks.chat.mockResolvedValue(null);
  mocks.prior.mockResolvedValue([]);
  mocks.title.mockResolvedValue(null);
  mocks.model.mockReturnValue({ toUIMessageStream: () => ({}) });
});

describe("chat POST secret handling", () => {
  it("redacts before title, storage, model and client stream with detection enabled", async () => {
    const { POST } = await import("@/app/(chat)/api/chat/route");
    const response = await POST(post({ message: message(), secretDetectionEnabled: false }));
    expect(response.status).toBe(200);
    expect(mocks.enabled).toHaveBeenCalledWith("org-1");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", createdBy: "user-1", value: secret }));
    for (const payload of [mocks.saveMessages.mock.calls, mocks.title.mock.calls, mocks.model.mock.calls, mocks.writes]) {
      expect(JSON.stringify(payload)).not.toContain(secret);
      expect(JSON.stringify(payload)).toContain("🔒 $GITHUB_TOKEN_");
    }
  });

  it("redacts approval messages, request history and older stored turns before model use", async () => {
    const { POST } = await import("@/app/(chat)/api/chat/route");
    mocks.chat.mockResolvedValue({ id, userId: "user-1", visibility: "private" });
    mocks.prior.mockResolvedValue([{ id: "old", chatId: id, role: "user", parts: message().parts, attachments: [], createdAt: new Date() }]);
    const response = await POST(post({ messages: [message()], history: [message()] }));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    for (const payload of [mocks.updateMessage.mock.calls, mocks.model.mock.calls, mocks.streams, mocks.writes]) {
      expect(JSON.stringify(payload)).not.toContain(secret);
      expect(JSON.stringify(payload)).toContain("🔒 $GITHUB_TOKEN_");
    }
  });

  it("honors the workspace setting, not a request override", async () => {
    const { POST } = await import("@/app/(chat)/api/chat/route");
    mocks.enabled.mockResolvedValue(false);
    const response = await POST(post({ message: message(), secretDetectionEnabled: true }));
    expect(response.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.saveMessages.mock.calls)).toContain(secret);
    expect(JSON.stringify(mocks.title.mock.calls)).toContain(secret);
  });

  it("fails closed without logging or invoking title, storage or model when the vault fails", async () => {
    const { POST } = await import("@/app/(chat)/api/chat/route");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValue(new Error(secret));
    const response = await POST(post({ message: message() }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    expect(log).not.toHaveBeenCalled();
    expect(mocks.saveChat).not.toHaveBeenCalled();
    expect(mocks.saveMessages).not.toHaveBeenCalled();
    expect(mocks.title).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("fails closed when the workspace setting cannot be read", async () => {
    const { POST } = await import("@/app/(chat)/api/chat/route");
    mocks.enabled.mockImplementation(() => { throw new Error(secret); });
    const response = await POST(post({ message: message() }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    expect(mocks.saveChat).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
