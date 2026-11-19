import "server-only";

import { generateText, streamText, wrapLanguageModel } from "ai";

import { Client } from "langsmith";
import { wrapAISDK } from "langsmith/experimental/vercel";

const ai = { generateText, streamText, wrapLanguageModel };

/** Opt-in only. Legacy misspelling is supported without copying secret values. */
export function tracingConfiguration(
  env: Record<string, string | undefined> = process.env
) {
  const apiKey = env.LANGSMITH_API_KEY ?? env.LANGSMITHAPIKEE;
  return {
    enabled: env.LANGSMITH_TRACING === "true" && Boolean(apiKey),
    apiKey,
  };
}

export const privateTraceOptions = {
  hideInputs: true,
  hideOutputs: true,
  hideMetadata: true,
  // The SDK also applies its anonymizer to errors. Never export raw messages.
  anonymizer: () => ({ error: "Redacted application error" }),
  timeout_ms: 3000,
  callerOptions: { maxRetries: 0 },
};

export function createChatTracing() {
  const config = tracingConfiguration();
  if (!config.enabled) {
    return { streamText: ai.streamText, flush: async () => undefined };
  }
  try {
    const client = new Client({
      ...privateTraceOptions,
      apiKey: config.apiKey,
    });
    const wrapped = wrapAISDK(ai, {
      client,
      tracingEnabled: true,
      name: "zooka-chat",
      traceRawHttp: false,
      traceResponseMetadata: false,
      processInputs: () => ({}),
      processOutputs: () => ({}),
      processChildLLMRunInputs: () => ({}),
      processChildLLMRunOutputs: () => ({}),
    });
    return {
      streamText: wrapped.streamText,
      flush: async () => {
        try {
          await client.awaitPendingTraceBatches();
        } catch {
          console.warn("langsmith_flush_failed");
        }
      },
    };
  } catch {
    console.warn("langsmith_init_failed");
    return { streamText: ai.streamText, flush: async () => undefined };
  }
}
