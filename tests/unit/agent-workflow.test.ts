import assert from "node:assert/strict";
import { test } from "node:test";
import { agentModeErrorResponse } from "@/lib/ai/agent-mode-errors";
import { agentPresets } from "@/lib/ai/agent-presets";
import { chatModels, modelSupportsTools } from "@/lib/ai/models";

test("Agent presets use configured models that support tools", () => {
  for (const preset of agentPresets) {
    assert.ok(chatModels.some((model) => model.id === preset.modelId));
    assert.equal(modelSupportsTools(preset.modelId), true);
    assert.ok(preset.prompt.ar.length > 0);
    assert.ok(preset.prompt.en.length > 0);
  }
});

test("Agent errors keep the response envelope expected by chat clients", async () => {
  const cases = [
    { key: "unsupported_model", status: 400, code: "bad_request:api" },
    { key: "paid_model_required", status: 403, code: "forbidden:chat" },
    { key: "plan_required", status: 403, code: "forbidden:chat" },
    { key: "quota", status: 429, code: "rate_limit:chat" },
  ] as const;

  for (const testCase of cases) {
    const modelId =
      testCase.key === "unsupported_model"
        ? "xai/grok-code-fast-1-thinking"
        : undefined;
    const response = agentModeErrorResponse(testCase.key, "ar", modelId);
    const body = (await response.json()) as {
      cause: string;
      code: string;
      message: string;
    };

    assert.equal(response.status, testCase.status);
    assert.equal(body.code, testCase.code);
    assert.ok(body.message.length > 0);
    assert.ok(body.cause.length > 0);
    if (modelId) {
      assert.ok(body.cause.includes(modelId));
    }
  }
});
