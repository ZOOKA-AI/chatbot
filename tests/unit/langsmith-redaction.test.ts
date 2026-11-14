import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { privateTraceOptions } from "@/lib/ai/tracing";

test("real LangSmith client strips synthetic private fields before its HTTP transport", async () => {
  const payloads: string[] = [];
  const client = new Client({
    ...privateTraceOptions,
    apiKey: "local-transport-test-only",
    apiUrl: "https://traces.example.test",
    autoBatchTracing: false,
    fetchImplementation: async (_input, init) => {
      payloads.push(await new Response(init?.body).text());
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await client.createRun({
    id: randomUUID(),
    name: "privacy-test",
    run_type: "chain",
    inputs: { prompt: "PRIVATE_PROMPT_MARKER" },
    outputs: { answer: "PRIVATE_OUTPUT_MARKER" },
    extra: { metadata: { email: "PRIVATE_METADATA_MARKER" } },
    error: "PRIVATE_ERROR_MARKER",
  });
  await client.awaitPendingTraceBatches();
  expect(payloads.length).toBeGreaterThan(0);
  const serialized = payloads.join("\n");
  for (const marker of [
    "PRIVATE_PROMPT_MARKER",
    "PRIVATE_OUTPUT_MARKER",
    "PRIVATE_METADATA_MARKER",
    "PRIVATE_ERROR_MARKER",
  ]) {
    expect(serialized).not.toContain(marker);
  }
  expect(serialized).toContain("privacy-test");
});

test("real AI SDK 6 stream works through the pinned wrapper without exporting synthetic message content", async () => {
  const {
    generateText,
    streamText,
    wrapLanguageModel,
    simulateReadableStream,
  } = await import("ai");
  const { MockLanguageModelV3 } = await import("ai/test");
  const { wrapAISDK } = await import("langsmith/experimental/vercel");
  const payloads: string[] = [];
  const client = new Client({
    ...privateTraceOptions,
    apiKey: "local-transport-test-only",
    apiUrl: "https://traces.example.test",
    autoBatchTracing: false,
    fetchImplementation: async (_input, init) => {
      payloads.push(await new Response(init?.body).text());
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const wrapped = wrapAISDK(
    { generateText, streamText, wrapLanguageModel },
    {
      client,
      tracingEnabled: true,
      name: "synthetic-chat",
      traceRawHttp: false,
      processInputs: () => ({}),
      processOutputs: () => ({}),
      processChildLLMRunInputs: () => ({}),
      processChildLLMRunOutputs: () => ({}),
    }
  );
  const result = wrapped.streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks: [
            { type: "text-start", id: "test" },
            { type: "text-delta", id: "test", delta: "PRIVATE_STREAM_MARKER" },
            { type: "text-end", id: "test" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      }),
    }),
    prompt: "PRIVATE_INPUT_MARKER",
  });
  expect(await result.text).toBe("PRIVATE_STREAM_MARKER");
  await client.awaitPendingTraceBatches();
  const serialized = payloads.join("\n");
  expect(payloads.length).toBeGreaterThan(0);
  expect(serialized).not.toContain("PRIVATE_STREAM_MARKER");
  expect(serialized).not.toContain("PRIVATE_INPUT_MARKER");
});
