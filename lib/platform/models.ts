import "server-only";

import type { PlatformConfig, ModelProviderName } from "./config";

/**
 * Model providers, kept as a resolution step rather than a set of imports.
 *
 * The lock-in being removed here is not "we picked OpenAI"; it is that a model choice was
 * previously *hardcoded in the call path*. A self-hosted install should be able to point
 * at vLLM, Ollama, LiteLLM, Anthropic, Google or a gateway by setting four variables, and
 * every one of them speaks either the OpenAI-compatible wire format or its own native one.
 *
 * Nothing in this module contacts a provider. It resolves an endpoint and, in
 * `chatCompletion`, speaks the OpenAI-compatible format using plain `fetch`, so it can be
 * pointed at a local stub in tests and at a real endpoint in production.
 */

export type ResolvedModel = {
  provider: ModelProviderName;
  modelId: string;
  /** Absolute URL of the chat-completions endpoint, or null for providers with no URL. */
  endpoint: string | null;
  headers: Record<string, string>;
  wireFormat: "openai-compatible" | "native";
  timeoutMs: number;
};

const OPENAI_PATHS: Record<string, string> = {
  "openai-compatible": "/chat/completions",
  ollama: "/chat/completions",
  gateway: "/v1/chat/completions",
};

export function resolveModel(config: Pick<PlatformConfig, "models">): ResolvedModel {
  const { provider, modelId, apiKey, baseUrl, timeoutMs } = config.models;

  if (provider === "gateway") {
    // The hosted gateway keeps working for anyone who has it; it is simply no longer
    // the only option, and it is not required.
    return {
      provider,
      modelId,
      endpoint: baseUrl ?? null,
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      wireFormat: baseUrl ? "openai-compatible" : "native",
      timeoutMs,
    };
  }

  if (provider === "anthropic" || provider === "google") {
    // These have their own request shapes. Reported as native so nothing pretends an
    // OpenAI-compatible body will be understood by them.
    return {
      provider,
      modelId,
      endpoint: baseUrl ?? null,
      headers: apiKey ? { "x-api-key": apiKey } : {},
      wireFormat: "native",
      timeoutMs,
    };
  }

  const base = (baseUrl ?? (provider === "ollama" ? "http://127.0.0.1:11434/v1" : "")).replace(/\/$/, "");
  if (!base) {
    throw new Error(`MODEL_BASE_URL is required for provider "${provider}"`);
  }

  return {
    provider,
    modelId,
    endpoint: `${base}${OPENAI_PATHS[provider] ?? "/chat/completions"}`,
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    wireFormat: "openai-compatible",
    timeoutMs,
  };
}

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export type ChatResult = { text: string; model: string; raw: unknown };

/**
 * One OpenAI-compatible call. Deliberately plain: `fetch`, an abort timer, and a refusal
 * to guess at a malformed answer. If a self-hosted model returns prose where a completion
 * was expected, that is an error the operator should see, not something to paper over.
 */
export async function chatCompletion(
  model: ResolvedModel,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ChatResult> {
  if (!model.endpoint) {
    throw new Error(`provider "${model.provider}" has no endpoint configured`);
  }
  if (model.wireFormat !== "openai-compatible") {
    throw new Error(
      `provider "${model.provider}" speaks its own wire format; chatCompletion only speaks openai-compatible`
    );
  }

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), model.timeoutMs);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await doFetch(model.endpoint, {
      method: "POST",
      headers: model.headers,
      body: JSON.stringify({ model: model.modelId, messages }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`model returned ${response.status}: ${body.slice(0, 300)}`);
    }

    const parsed = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; model?: string };
    const text = parsed.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("model response had no choices[0].message.content");
    }
    return { text, model: parsed.model ?? model.modelId, raw: parsed };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
