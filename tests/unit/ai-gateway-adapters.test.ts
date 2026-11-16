import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FalError, falResult, falStatus, submitFal } from "@/lib/studio/gateway/fal";
import {
  comfyGatewayProvider,
  falConfiguredModels,
  falGatewayProvider,
  localGatewayProvider,
  runcomfyGatewayProvider,
} from "@/lib/studio/gateway/providers";

/**
 * The adapters against the documented wire format.
 *
 * fal fixtures follow https://fal.ai/docs/documentation/model-apis/queue, including the rule that the
 * status/result/cancel URLs use only owner and app: a URL carrying the full model path returns 405.
 */

const FAL_KEY = "fal_test_key_do_not_use";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function stub(responses: Array<{ status?: number; body: unknown; text?: string }>) {
  calls = [];
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return new Response(next.text ?? JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
}

const opts = () => ({ fetchImpl: globalThis.fetch, token: FAL_KEY, retries: 0 });
const authHeader = (init: RequestInit) => String((init.headers as Record<string, string>).authorization);

afterEach(() => vi.unstubAllGlobals());

describe("fal: documented paths and the 405 rule", () => {
  test("submit posts to the model path on the queue host with the Key scheme", async () => {
    stub([
      {
        body: {
          request_id: "req-1",
          status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
          response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1",
          cancel_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
          queue_position: 0,
        },
      },
    ]);

    const receipt = await submitFal("fal-ai/flux/schnell", { prompt: "sunset" }, opts());
    assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux/schnell");
    assert.equal(calls[0].init.method, "POST");
    assert.ok(authHeader(calls[0].init).startsWith("Key "));
    assert.equal(receipt.requestId, "req-1");
    // The returned URLs are kept, because a rebuilt URL with the model path is a documented 405.
    assert.ok(receipt.statusUrl.includes("/fal-ai/flux/requests/req-1/status"));
    assert.ok(!receipt.statusUrl.includes("schnell"));
  });

  test("status is polled from the URL the submit returned, and the three states are mapped", async () => {
    stub([
      { body: { status: "IN_QUEUE", request_id: "req-1", queue_position: 2 } },
      { body: { status: "IN_PROGRESS", request_id: "req-1", logs: [] } },
      { body: { status: "COMPLETED", request_id: "req-1" } },
    ]);
    const receipt = { requestId: "req-1", statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status" };
    assert.equal((await falStatus(receipt, opts())).status, "IN_QUEUE");
    assert.equal((await falStatus(receipt, opts())).status, "IN_PROGRESS");
    assert.equal((await falStatus(receipt, opts())).status, "COMPLETED");
    assert.equal(calls[0].url, receipt.statusUrl);
  });

  test("an unknown status is bad_response rather than a guess", async () => {
    stub([{ body: { status: "SOMETHING_NEW" } }]);
    await assert.rejects(
      () => falStatus({ requestId: "r", statusUrl: "https://queue.fal.run/a/b/requests/r/status" }, opts()),
      (error: unknown) => error instanceof FalError && error.code === "bad_response"
    );
  });

  test("the result is fetched from the response URL", async () => {
    stub([{ body: { images: [{ url: "https://fal.media/a.png" }] } }]);
    const raw = await falResult({ requestId: "req-1", responseUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1" }, opts());
    assert.match(JSON.stringify(raw), /fal\.media/);
  });

  test("a path-shaped request URL is classified as an invalid request, as documented", async () => {
    stub([{ status: 405, body: { detail: "Method Not Allowed" } }]);
    await assert.rejects(
      () => falStatus({ requestId: "r", statusUrl: "https://queue.fal.run/fal-ai/flux/schnell/requests/r/status" }, opts()),
      (error: unknown) => error instanceof FalError && error.code === "invalid_request"
    );
  });

  test("a submit is never retried, and the key is redacted from messages", async () => {
    const failing = stub([{ status: 500, body: { detail: `upstream said Key ${FAL_KEY}` } }]);
    await assert.rejects(
      () => submitFal("fal-ai/flux/schnell", { prompt: "x" }, { fetchImpl: globalThis.fetch, token: FAL_KEY, retries: 3 }),
      (error: unknown) => {
        assert.ok(error instanceof FalError);
        assert.ok(!error.message.includes(FAL_KEY), `key leaked: ${error.message}`);
        return true;
      }
    );
    void failing;
    assert.equal(calls.length, 1, "one submit, one bill");
  });

  test("no key means not_configured before any request", async () => {
    stub([{ body: {} }]);
    await assert.rejects(
      () => submitFal("fal-ai/flux/schnell", {}, { fetchImpl: globalThis.fetch, token: null }),
      (error: unknown) => error instanceof FalError && error.code === "not_configured"
    );
    assert.equal(calls.length, 0);
  });
});

describe("fal: readiness and configured models are stated honestly", () => {
  test("a missing key is credential_missing", () => {
    const readiness = falGatewayProvider.readiness({});
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, "credential_missing");
  });

  test("a present key is selectable but reported as unverified, not as proven", () => {
    const readiness = falGatewayProvider.readiness({ FAL_KEY: FAL_KEY });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.code, "credential_unverified");
    assert.match(readiness.detail, /unverified/);
  });

  test("models come only from configuration, because fal publishes no catalogue call", () => {
    assert.deepEqual(falConfiguredModels("image_generate", {}), []);
    const offers = falConfiguredModels("image_generate", { FAL_MODELS_IMAGE: "fal-ai/flux/schnell, fal-ai/sdxl" });
    assert.equal(offers.length, 2);
    // No price is invented: an unconfigured price is null, and null is refused by the router.
    assert.equal(offers[0].priceUsd, null);
    assert.equal(offers[0].source, "configured");
  });

  test("an owner-entered price is used, and unknown stays unknown", () => {
    const [priced] = falConfiguredModels("image_generate", {
      FAL_MODELS_IMAGE: "fal-ai/flux/schnell",
      FAL_PRICE_USD_FAL_AI_FLUX_SCHNELL: "0.003",
    });
    const estimate = falGatewayProvider.estimate(priced, { outputs: 1 });
    assert.equal(estimate.usd, 0.003);
    assert.equal(estimate.kind, "estimated");

    const unknown = falGatewayProvider.estimate({ ...priced, priceUsd: null }, { outputs: 1 });
    assert.equal(unknown.usd, null);
    assert.equal(unknown.kind, "unknown");
  });
});

describe("runcomfy and the local engines through the same interface", () => {
  test("a missing token is credential_missing, never a silent attempt", () => {
    assert.equal(runcomfyGatewayProvider.readiness({}).code, "credential_missing");
    assert.equal(runcomfyGatewayProvider.readiness({ RUNCOMFY_API_TOKEN: "rc_x" }).ready, true);
  });

  test("discovery becomes a priced offer with the catalogue as its source", async () => {
    // The client reads its credential from the server environment, so the test sets one for this case only.
    process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
    stub([
      {
        body: {
          models: [
            {
              model_id: "blackforestlabs/flux-1-kontext/dev/image-to-image",
              display_name: "Flux Dev",
              categories: ["text-to-image"],
              base_price_usd: 0.06,
              price_unit: "output",
              required_inputs: ["prompt"],
            },
          ],
          total: 1,
        },
      },
    ]);
    const offers = await runcomfyGatewayProvider.listModels("image_generate");
    assert.equal(offers.length, 1);
    assert.equal(offers[0].priceUsd, 0.06);
    assert.equal(offers[0].source, "live_catalog");
    assert.equal(runcomfyGatewayProvider.estimate(offers[0], { outputs: 2 }).usd, 0.12);
    delete process.env.RUNCOMFY_API_TOKEN;
  });

  test("the local engines are free, always ready, and have no queue to poll", () => {
    assert.equal(localGatewayProvider.readiness({}).ready, true);
    assert.equal(localGatewayProvider.estimate({ id: "x", label: "x", capabilities: ["image_edit"], priceUsd: 0, priceUnit: "job", source: "local" }, {}).usd, 0);
    assert.equal(localGatewayProvider.paid, false);
  });

  test("ComfyUI without an endpoint is endpoint_missing, and it does not pretend to execute here", () => {
    const missing = comfyGatewayProvider.readiness({});
    assert.equal(missing.code, "endpoint_missing");
    const configured = comfyGatewayProvider.readiness({ COMFYUI_ENDPOINT: "https://gpu.local" });
    assert.equal(configured.ready, false);
    assert.equal(configured.code, "not_executable");
    assert.equal(comfyGatewayProvider.paid, false);
  });
});
