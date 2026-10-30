import assert from "node:assert/strict";
import { test } from "vitest";
import {
  describeModelProviderFailure,
  getMissingModelProviderMessage,
} from "@/lib/ai/provider-diagnostics";

test("model provider readiness recognizes supported runtime credentials", () => {
  const missing = {
    aiGatewayApiKey: "",
    geminiApiKey: "",
    vercel: "",
  };
  assert.match(
    getMissingModelProviderMessage("en", missing) ?? "",
    /AI_GATEWAY_API_KEY/
  );
  assert.match(
    getMissingModelProviderMessage("ar", missing) ?? "",
    /AI_GATEWAY_API_KEY/
  );
  assert.equal(
    getMissingModelProviderMessage("en", { ...missing, isTest: true }),
    null
  );
  assert.equal(
    getMissingModelProviderMessage("en", {
      ...missing,
      aiGatewayApiKey: "configured",
    }),
    null
  );
  assert.equal(
    getMissingModelProviderMessage("en", {
      ...missing,
      geminiApiKey: "configured",
    }),
    null
  );
  assert.equal(
    getMissingModelProviderMessage("en", { ...missing, vercel: "1" }),
    null
  );
});

test("model provider failures give safe actionable localized messages", () => {
  assert.match(
    describeModelProviderFailure({ statusCode: 401 }, "en"),
    /AI Gateway key/
  );
  assert.match(
    describeModelProviderFailure({ statusCode: 402 }, "ar"),
    /الفوترة/
  );
  assert.match(
    describeModelProviderFailure({ statusCode: 404 }, "en"),
    /model ID/
  );
  assert.match(
    describeModelProviderFailure({ statusCode: 429 }, "en"),
    /rate limit/
  );
  assert.match(
    describeModelProviderFailure({ name: "TimeoutError" }, "ar"),
    /مهلة/
  );
  assert.match(
    describeModelProviderFailure(new Error("secret-bearing upstream body"), "en"),
    /review server logs/
  );
  assert.doesNotMatch(
    describeModelProviderFailure(new Error("secret-bearing upstream body"), "en"),
    /secret-bearing/
  );
});
