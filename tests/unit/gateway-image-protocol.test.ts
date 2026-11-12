import assert from "node:assert/strict";
import { createGateway } from "@ai-sdk/gateway";
import { generateImage } from "ai";
import { test } from "vitest";

// Local fixture only: no inference, secrets, provider or Blob calls.
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZqsAAAAASUVORK5CYII=";
test("successful image response with non-other warnings remains usable", async () => {
  let calls = 0;
  const provider = createGateway({
    apiKey: "test-only-not-a-real-key",
    fetch: async () => {
      calls++;
      return Response.json({
        images: [png],
        warnings: [
          { type: "unsupported", feature: "size", details: "fixture warning" },
        ],
      });
    },
  });
  const result = await generateImage({
    model: provider.imageModel("bfl/flux-2-pro"),
    prompt: "fixture",
    n: 1,
    maxRetries: 0,
  });
  assert.equal(calls, 1);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.mediaType, "image/png");
  assert.ok(result.images[0]?.uint8Array.length);
});

test("upstream failure throws an Error instead of an unresolved Promise", async () => {
  const provider = createGateway({
    apiKey: "test-only-not-a-real-key",
    fetch: async () =>
      Response.json(
        { error: { message: "test failure", type: "invalid_request_error" } },
        { status: 403 }
      ),
  });
  let failure: unknown;
  try {
    await generateImage({
      model: provider.imageModel("bfl/flux-2-pro"),
      prompt: "fixture",
      maxRetries: 0,
    });
  } catch (error) {
    failure = error;
  }
  // Settle a buggy SDK's thrown promise to avoid leaving an unhandled rejection.
  if (failure instanceof Promise) {
    await failure.catch(() => undefined);
  }
  assert.ok(failure instanceof Error);
  assert.equal(failure instanceof Promise, false);
});
