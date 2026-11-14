import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: vi.fn(),
  wrap: vi.fn(),
  flush: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("langsmith", () => ({
  Client: class {
    constructor(options: unknown) {
      state.client(options);
    }
    awaitPendingTraceBatches = state.flush;
  },
}));
vi.mock("langsmith/experimental/vercel", () => ({ wrapAISDK: state.wrap }));

import { streamText } from "ai";
import {
  createChatTracing,
  privateTraceOptions,
  tracingConfiguration,
} from "@/lib/ai/tracing";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LANGSMITH_TRACING", "false");
  vi.stubEnv("LANGSMITH_API_KEY", "");
  vi.stubEnv("LANGSMITHAPIKEE", "");
  state.wrap.mockReturnValue({ streamText: state.stream });
  state.flush.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
test("tracing is off unless explicitly enabled with a credential", async () => {
  expect(tracingConfiguration({ LANGSMITH_TRACING: "true" }).enabled).toBe(
    false
  );
  expect(createChatTracing().streamText).toBe(streamText);
  await createChatTracing().flush();
  expect(state.client).not.toHaveBeenCalled();
});
test("the documented key takes precedence over legacy misspelling", () => {
  expect(
    tracingConfiguration({
      LANGSMITH_TRACING: "true",
      LANGSMITHAPIKEE: "local-placeholder",
    }).enabled
  ).toBe(true);
  expect(
    tracingConfiguration({
      LANGSMITH_TRACING: "true",
      LANGSMITH_API_KEY: "correct",
      LANGSMITHAPIKEE: "old",
    }).apiKey
  ).toBe("correct");
});
test("enabled tracing hides contents, metadata, raw HTTP, and errors", async () => {
  vi.stubEnv("LANGSMITH_TRACING", "true");
  vi.stubEnv("LANGSMITH_API_KEY", "local-test-only");
  const tracing = createChatTracing();
  expect(tracing.streamText).toBe(state.stream);
  expect(state.client).toHaveBeenCalledWith(
    expect.objectContaining({
      hideInputs: true,
      hideOutputs: true,
      hideMetadata: true,
    })
  );
  expect(privateTraceOptions.anonymizer()).toEqual({
    error: "Redacted application error",
  });
  const options = state.wrap.mock.calls[0][1];
  expect(options.traceRawHttp).toBe(false);
  for (const field of [
    "processInputs",
    "processOutputs",
    "processChildLLMRunInputs",
    "processChildLLMRunOutputs",
  ]) {
    expect(options[field]({ prompt: "sensitive customer data" })).toEqual({});
  }
  await tracing.flush();
  expect(state.flush).toHaveBeenCalledOnce();
});
test("trace upload failure does not throw or print provider details", async () => {
  vi.stubEnv("LANGSMITH_TRACING", "true");
  vi.stubEnv("LANGSMITH_API_KEY", "local-test-only");
  state.flush.mockRejectedValueOnce(new Error("secret remote response"));
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    await expect(createChatTracing().flush()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("langsmith_flush_failed");
  } finally {
    log.mockRestore();
  }
});

test("tracing initialization failure leaves the existing chat implementation available", () => {
  vi.stubEnv("LANGSMITH_TRACING", "true");
  vi.stubEnv("LANGSMITH_API_KEY", "local-test-only");
  state.wrap.mockImplementationOnce(() => {
    throw new Error("sensitive init details");
  });
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(createChatTracing().streamText).toBe(streamText);
    expect(log).toHaveBeenCalledWith("langsmith_init_failed");
  } finally {
    log.mockRestore();
  }
});
