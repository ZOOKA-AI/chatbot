import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chatCompletion, resolveModel } from "@/lib/platform/models";
import type { PlatformConfig } from "@/lib/platform/config";

const base = (overrides: Partial<PlatformConfig["models"]> = {}): Pick<PlatformConfig, "models"> => ({
  models: {
    provider: "openai-compatible",
    modelId: "local-model",
    apiKey: null,
    baseUrl: "http://127.0.0.1:8080/v1",
    timeoutMs: 5000,
    ...overrides,
  },
});

describe("choosing a model provider", () => {
  test("an OpenAI-compatible server needs only a base URL", () => {
    const model = resolveModel(base());
    assert.equal(model.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
    assert.equal(model.wireFormat, "openai-compatible");
    assert.deepEqual(model.headers.authorization, undefined);
  });

  test("a trailing slash does not produce a double slash", () => {
    const model = resolveModel(base({ baseUrl: "http://host:8080/v1/" }));
    assert.equal(model.endpoint, "http://host:8080/v1/chat/completions");
  });

  test("ollama resolves to its own default without configuration", () => {
    const model = resolveModel(base({ provider: "ollama", baseUrl: null }));
    assert.equal(model.endpoint, "http://127.0.0.1:11434/v1/chat/completions");
  });

  test("native providers are labelled as such rather than mis-signed", async () => {
    const model = resolveModel(base({ provider: "anthropic", apiKey: "k", baseUrl: "https://api.anthropic.com/v1/messages" }));
    assert.equal(model.wireFormat, "native");
    assert.equal(model.headers["x-api-key"], "k");
    await assert.rejects(() => chatCompletion(model, [{ role: "user", content: "hi" }]), /own wire format/);
  });

  test("a missing base URL is an error, not a silent default", () => {
    assert.throws(() => resolveModel(base({ baseUrl: null })), /MODEL_BASE_URL is required/);
  });
});

describe("speaking to an OpenAI-compatible endpoint", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function serve(handler: Parameters<typeof createServer>[1]) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return `http://127.0.0.1:${port}/v1`;
  }

  test("a real local endpoint returns text, and the request body is what was asked for", async () => {
    let seen: { model?: string; messages?: unknown } = {};
    const baseUrl = await serve((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        seen = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ model: seen.model, choices: [{ message: { content: "pong" } }] }));
      });
    });

    const model = resolveModel(base({ baseUrl }));
    const result = await chatCompletion(model, [{ role: "user", content: "ping" }]);
    assert.equal(result.text, "pong");
    assert.equal(seen.model, "local-model");
  });

  test("an error status surfaces the provider's own message", async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "context length exceeded" }));
    });

    await assert.rejects(
      () => chatCompletion(resolveModel(base({ baseUrl })), [{ role: "user", content: "x" }]),
      /context length exceeded/
    );
  });

  test("a well-formed 200 with no content is an error, not an empty string", async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [] }));
    });
    await assert.rejects(() => chatCompletion(resolveModel(base({ baseUrl })), [{ role: "user", content: "x" }]), /no choices/);
  });
});
