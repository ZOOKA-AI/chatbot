import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  RunComfyError,
  cancelRequest,
  getBalance,
  getModel,
  listModels,
  probeConnection,
  requestResult,
  requestStatus,
  submitRequest,
} from "@/lib/studio/runcomfy";

/**
 * The RunComfy client against the documented wire format.
 *
 * Every fixture below is copied from https://docs.runcomfy.com/model-apis/*, including field names. The
 * tests exist to catch the two failures that matter: a path drifting away from the documentation, and a
 * token leaking into a message. No test here reaches the network or submits inference.
 */

const TOKEN = "rc_test_token_do_not_use_1234567890";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status?: number; body: unknown; text?: string }>) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const text = next.text ?? JSON.stringify(next.body);
    return new Response(text, {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const options = (impl: typeof fetch) => ({ fetchImpl: impl, token: TOKEN, retries: 0 });

describe("the documented endpoints are the ones called", () => {
  test("model discovery reads the catalogue shape and its price fields", async () => {
    const { impl, calls } = mockFetch([
      {
        body: {
          models: [
            {
              model_id: "blackforestlabs/flux-1-kontext/dev/image-to-image",
              display_name: "Flux Kontext Dev",
              categories: ["image-to-image"],
              kind: "model",
              base_price_usd: 0.06,
              price_unit: "output",
              pricing_note: "The rate is $0.06 per image.",
              required_inputs: ["prompt", "image_url"],
              supported_batch_size: [1, 2, 3, 4],
            },
          ],
          total: 371,
          limit: 20,
          offset: 0,
        },
      },
    ]);

    const catalog = await listModels({ search: "kontext", limit: 20 }, options(impl));
    assert.equal(calls[0].url, "https://model-api.runcomfy.net/v1/models?search=kontext&limit=20");
    assert.equal(catalog.total, 371);
    assert.equal(catalog.models[0].modelId, "blackforestlabs/flux-1-kontext/dev/image-to-image");
    assert.equal(catalog.models[0].basePriceUsd, 0.06);
    assert.equal(catalog.models[0].priceUnit, "output");
    assert.deepEqual(catalog.models[0].requiredInputs, ["prompt", "image_url"]);
  });

  test("one model's schema is fetched from its own path, encoded", async () => {
    const { impl, calls } = mockFetch([{ body: { model_id: "a/b", input_schema: { type: "object" } } }]);
    await getModel("a/b/edit", options(impl));
    assert.equal(calls[0].url, "https://model-api.runcomfy.net/v1/models/a%2Fb%2Fedit");
  });

  test("the wallet is read from the core host, not the model host", async () => {
    const { impl, calls } = mockFetch([{ body: { balance_microdollars: 500000, balance_usd: 0.5, currency: "USD" } }]);
    const balance = await getBalance(options(impl));
    assert.equal(calls[0].url, "https://api.runcomfy.net/prod/v2/balance");
    assert.equal(balance.balanceMicrodollars, 500000);
    assert.equal(balance.balanceUsd, 0.5);
  });

  test("submission posts to the model path and returns the request id", async () => {
    const { impl, calls } = mockFetch([
      {
        body: {
          request_id: "req_123",
          status_url: "https://model-api.runcomfy.net/v1/requests/req_123/status",
          result_url: "https://model-api.runcomfy.net/v1/requests/req_123/result",
          cancel_url: "https://model-api.runcomfy.net/v1/requests/req_123/cancel",
        },
      },
    ]);

    const receipt = await submitRequest("blackforestlabs/flux-1-kontext/pro/edit", { prompt: "umbrella" }, options(impl));
    assert.equal(calls[0].url, "https://model-api.runcomfy.net/v1/models/blackforestlabs%2Fflux-1-kontext%2Fpro%2Fedit");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(JSON.parse(String(calls[0].init.body)).prompt, "umbrella");
    assert.equal(receipt.requestId, "req_123");
  });

  test("status and result map the documented lifecycles", async () => {
    const { impl } = mockFetch([
      { body: { request_id: "req_123", status: "in_queue", queue_position: 3 } },
      { body: { request_id: "req_123", status: "succeeded", output: { image: "https://x/a.png" }, cost: 0.06 } },
    ]);

    const status = await requestStatus("req_123", options(impl));
    assert.equal(status.status, "in_queue");
    assert.equal(status.queuePosition, 3);

    const result = await requestResult("req_123", options(impl));
    assert.equal(result.status, "succeeded");
    assert.equal(result.costUsd, 0.06);
  });

  test("the result call asks for the real cost instead of assuming it", async () => {
    const { impl, calls } = mockFetch([{ body: { request_id: "r", status: "succeeded", output: {} } }]);
    await requestResult("r", options(impl));
    assert.ok(calls[0].url.includes("include_cost=true"));
  });

  test("cancellation reports the provider's own outcome", async () => {
    const { impl, calls } = mockFetch([{ status: 202, body: { request_id: "r", status: "completed", outcome: "not_cancellable" } }]);
    const result = await cancelRequest("r", options(impl));
    assert.equal(calls[0].init.method, "POST");
    assert.equal(result.outcome, "not_cancellable");
  });
});

describe("failures are named, and never quote the token", () => {
  test("no token means not_configured, before any request is made", async () => {
    const { impl, calls } = mockFetch([{ body: {} }]);
    await assert.rejects(
      () => listModels({}, { fetchImpl: impl, token: null }),
      (error: unknown) => error instanceof RunComfyError && error.code === "not_configured"
    );
    assert.equal(calls.length, 0, "nothing was sent without a credential");
  });

  test("400002 is insufficient balance, 400004 is authentication", async () => {
    const insufficient = mockFetch([{ status: 402, body: { code: 400002, message: "no balance" } }]);
    await assert.rejects(
      () => submitRequest("m", {}, options(insufficient.impl)),
      (error: unknown) => error instanceof RunComfyError && error.code === "insufficient_balance"
    );

    const badToken = mockFetch([{ status: 401, body: { code: 400004, message: "invalid token" } }]);
    await assert.rejects(
      () => listModels({}, options(badToken.impl)),
      (error: unknown) => error instanceof RunComfyError && error.code === "unauthorized"
    );
  });

  test("a 404 is not_found and a 400 is invalid_request, neither guessed", async () => {
    const missing = mockFetch([{ status: 404, body: { code: 404001, message: "gone" } }]);
    await assert.rejects(
      () => requestStatus("nope", options(missing.impl)),
      (error: unknown) => error instanceof RunComfyError && error.code === "not_found"
    );

    const bad = mockFetch([{ status: 400, body: { code: 400001, message: "bad id" } }]);
    await assert.rejects(
      () => getModel("", options(bad.impl)),
      (error: unknown) => error instanceof RunComfyError && error.code === "invalid_request"
    );
  });

  test("a submit is never retried, because a retried bill is two bills", async () => {
    const { impl, calls } = mockFetch([{ status: 500, body: { message: "boom" } }]);
    await assert.rejects(() => submitRequest("m", {}, { fetchImpl: impl, token: TOKEN, retries: 3 }));
    assert.equal(calls.length, 1);
  });

  test("a rate limit is retried, then succeeds", async () => {
    const { impl, calls } = mockFetch([
      { status: 429, body: { message: "slow down" } },
      { body: { models: [], total: 0 } },
    ]);
    const catalog = await listModels({}, { fetchImpl: impl, token: TOKEN, retries: 1 });
    assert.equal(catalog.total, 0);
    assert.equal(calls.length, 2, "the second attempt happened");
  });

  test("the token is redacted from a provider message that echoes it", async () => {
    const { impl } = mockFetch([{ status: 400, body: { message: `bad request for Bearer ${TOKEN}` } }]);
    await assert.rejects(
      () => listModels({}, options(impl)),
      (error: unknown) => {
        assert.ok(error instanceof RunComfyError);
        assert.ok(!error.message.includes(TOKEN), `token leaked: ${error.message}`);
        assert.ok(error.message.includes("[redacted]"));
        return true;
      }
    );
  });

  test("a non-JSON body is bad_response, not a crash", async () => {
    const { impl } = mockFetch([{ status: 200, body: null, text: "<html>gateway</html>" }]);
    await assert.rejects(
      () => listModels({}, options(impl)),
      (error: unknown) => error instanceof RunComfyError && error.code === "bad_response"
    );
  });
});

describe("the connectivity probe spends nothing", () => {
  test("it reads discovery and the wallet, and reports the account's real categories", async () => {
    const { impl, calls } = mockFetch([
      { body: { models: [{ model_id: "a", categories: ["text-to-image"] }], total: 12 } },
      { body: { balance_microdollars: 500000, balance_usd: 0.5, currency: "USD" } },
      { body: { models: [{ model_id: "a", categories: ["text-to-image", "image-to-video"] }, { model_id: "b", categories: ["text-to-image"] }], total: 12 } },
    ]);

    const probe = await probeConnection(options(impl));
    assert.equal(probe.connected, true);
    assert.equal(probe.modelsVisible, 12);
    assert.deepEqual(probe.categories, ["image-to-video", "text-to-image"]);
    assert.equal(probe.balanceUsd, 0.5);
    assert.ok(
      calls.every((call) => call.init.method === undefined || call.init.method === "GET"),
      "the probe never posts"
    );
  });

  test("a dead provider is reported as an error, not as connected", async () => {
    const { impl } = mockFetch([{ status: 503, body: { message: "unavailable" } }]);
    const probe = await probeConnection({ fetchImpl: impl, token: TOKEN, retries: 0 });
    assert.equal(probe.connected, false);
    assert.equal(probe.error?.code, "provider_unavailable");
  });
});
