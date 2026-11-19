import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

/**
 * Groq is the third provider in the ladder (gateway → Google → Groq). These assertions pin
 * two things that are easy to get wrong: which provider a bare model id resolves to when
 * only a Groq key exists, and that a mistyped groq/ id cannot silently answer with a
 * different model.
 */
async function loadProvider(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/lib/ai/providers");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("with only a Groq key configured, chat resolves through Groq", async () => {
  const provider = await loadProvider({
    AI_GATEWAY_API_KEY: "",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "groq-test-key",
  });

  assert.equal(provider.USE_GROQ, true);
  const model = provider.getLanguageModel("openai/gpt-4.1-mini");
  assert.equal(model.modelId, provider.GROQ_DEFAULT_MODEL);
  assert.equal(model.provider, "groq.chat");
});

test("an explicit groq model id is mapped to Groq's own catalogue id", async () => {
  const provider = await loadProvider({
    AI_GATEWAY_API_KEY: "gateway-key-present",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "groq-test-key",
  });

  // A gateway key exists, so the fallback is off, but an explicit groq request still routes.
  assert.equal(provider.USE_GROQ, false);
  assert.equal(provider.getLanguageModel("groq/gpt-oss-20b").modelId, "openai/gpt-oss-20b");
  assert.equal(provider.getLanguageModel("groq/gpt-oss-120b").modelId, "openai/gpt-oss-120b");
});

test("a mistyped groq model id fails instead of answering with another model", async () => {
  const provider = await loadProvider({
    AI_GATEWAY_API_KEY: "gateway-key-present",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "groq-test-key",
  });

  assert.throws(() => provider.getLanguageModel("groq/not-a-real-model"), /Unknown Groq model/);
});

test("a groq model id without a key is refused, not silently downgraded", async () => {
  const provider = await loadProvider({
    AI_GATEWAY_API_KEY: "gateway-key-present",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "",
  });

  assert.throws(() => provider.getLanguageModel("groq/gpt-oss-20b"), /needs GROQ_API_KEY/);
});

test("existing providers keep priority when a gateway key is present", async () => {
  const provider = await loadProvider({
    AI_GATEWAY_API_KEY: "gateway-key-present",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "groq-test-key",
  });

  const model = provider.getLanguageModel("openai/gpt-4.1-mini");
  assert.notEqual(model.provider, "groq.chat");
});

test("provider readiness accepts a Groq key", async () => {
  const { getMissingModelProviderMessage } = await import("@/lib/ai/provider-diagnostics");
  assert.equal(
    getMissingModelProviderMessage("en", { aiGatewayApiKey: "", geminiApiKey: "", groqApiKey: "configured" }),
    null
  );
  assert.match(
    getMissingModelProviderMessage("en", { aiGatewayApiKey: "", geminiApiKey: "", groqApiKey: "" }) ?? "",
    /GROQ_API_KEY/
  );
});

test.skipIf(!process.env.GROQ_API_KEY)(
  "LIVE: Groq answers a real chat completion through the provider layer",
  async () => {
    const provider = await loadProvider({
      AI_GATEWAY_API_KEY: "",
      GEMINI_API_KEY: "",
      GROQ_API_KEY: process.env.GROQ_API_KEY as string,
    });
    const { generateText } = await import("ai");
    const result = await generateText({
      model: provider.getLanguageModel("groq/gpt-oss-20b"),
      prompt: "Reply with exactly one word: OK",
      maxOutputTokens: 200,
    });
    assert.match(result.text.trim(), /OK/i, `unexpected completion: ${result.text}`);
    assert.ok(result.usage?.totalTokens && result.usage.totalTokens > 0, "usage must be reported");
  },
  60_000
);
