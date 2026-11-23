import { createGateway } from "@ai-sdk/gateway";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  reserve: vi.fn(),
  check: vi.fn(),
  release: vi.fn(),
  commit: vi.fn(),
  lang: "en" as "ar" | "en",
}));

vi.mock("@/lib/guest-quota", () => ({
  reserveGuestMessage: state.reserve,
  checkDemoMinuteLimit: state.check,
  releaseGuestHold: state.release,
  commitGuestMessage: state.commit,
}));
vi.mock("@/lib/i18n", () => ({ getLang: async () => state.lang }));
vi.mock("@/lib/ai/providers", () => ({
  getLanguageModel: (id: string) =>
    createGateway({ apiKey: "test", fetch: state.fetch }).languageModel(id),
}));

import { POST } from "@/app/api/demo-chat/route";
import { rateLimitRetrySeconds } from "@/lib/ai/demo-rate-limit";

function request() {
  return new Request("http://localhost/api/demo-chat", {
    method: "POST",
    body: JSON.stringify({
      message: { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
    }),
  });
}

function rateLimited(retryAfter?: string) {
  return Response.json(
    { error: { type: "rate_limit_exceeded", message: "rate limited" } },
    { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} }
  );
}

function successfulStream() {
  const parts = [
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "Hello back" },
    { type: "text-end", id: "text" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
    },
  ];
  return new Response(parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.reserve.mockResolvedValue({ ok: true, id: "guest:test:today", day: "today" });
  state.check.mockResolvedValue(true);
  state.release.mockResolvedValue(undefined);
  state.lang = "en";
});
afterEach(() => vi.useRealTimers());

describe("public demo gateway limits", () => {
  test("sends a fallback list so the gateway can use a second model after a 429", async () => {
    const attempted: string[] = [];
    state.fetch.mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const models = body.providerOptions.gateway.models as string[];
      attempted.push(models[0]); // Simulate the gateway receiving a 429 from the first provider.
      attempted.push(models[1]);
      return successfulStream();
    });

    const response = await POST(request());
    expect(await response.text()).toContain("Hello back");
    expect(attempted).toEqual(["openai/gpt-4.1-mini", "google/gemini-2.5-flash-lite"]);
    expect(state.commit).toHaveBeenCalledOnce();
    expect(state.release).not.toHaveBeenCalled();
  });

  test.each(["en", "ar"] as const)(
    "all models rate limited produces a friendly %s stream error and releases the hold",
    async (lang) => {
      state.lang = lang;
      state.fetch.mockResolvedValue(rateLimited("12"));
      const response = await POST(request());
      const body = await response.text();
      expect(body).toContain("demo_busy:12:");
      expect(body).toContain(lang === "ar" ? "الخدمة مشغولة" : "The service is busy");
      expect(state.fetch).toHaveBeenCalledOnce();
      expect(state.release).toHaveBeenCalledOnce();
      expect(state.commit).not.toHaveBeenCalled();
    }
  );

  test("retries once after a short nested retry-after", async () => {
    state.fetch.mockResolvedValueOnce(rateLimited("1")).mockResolvedValueOnce(successfulStream());
    const response = await POST(request());
    expect(await response.text()).toContain("Hello back");
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(state.commit).toHaveBeenCalledOnce();
  });

  test("does not retry more than once if the gateway remains rate limited", async () => {
    state.fetch.mockResolvedValue(rateLimited("1"));
    const response = await POST(request());
    expect(await response.text()).toContain("demo_busy:1:");
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(state.release).toHaveBeenCalledOnce();
  });

  test("visitor throttling returns 429 before calling the gateway", async () => {
    state.check.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toMatchObject({ code: "demo_busy", retryAfter: 60 });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });

  test("releases the hold if the throttle store fails", async () => {
    state.check.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  test("parses dates and rejects non-rate-limit errors", () => {
    const date = new Date(Date.now() + 10_000).toUTCString();
    expect(rateLimitRetrySeconds({ statusCode: 429, cause: { responseHeaders: { "retry-after": date } } })).toBeGreaterThan(0);
    expect(rateLimitRetrySeconds({ statusCode: 500 })).toBeNull();
    expect(rateLimitRetrySeconds({ statusCode: 429, responseHeaders: { "retry-after": "bad" } })).toBe(60);
  });
});
