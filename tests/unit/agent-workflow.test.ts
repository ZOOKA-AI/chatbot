import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasApprovedGoogleDriveCall,
  hasPendingToolApproval,
  isAgentAccessAuthorized,
} from "@/lib/ai/agent-access";
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

test("Google Drive approval parts are detected and denied outside Agent mode", () => {
  const messages = [
    {
      role: "assistant",
      parts: [
        {
          type: "tool-readGoogleDriveFile",
          state: "approval-responded",
          approval: { id: "approval-1", approved: true },
        },
      ],
    },
  ];

  assert.equal(hasApprovedGoogleDriveCall(messages), true);
  assert.equal(hasPendingToolApproval(messages), false);
  assert.equal(hasApprovedGoogleDriveCall([{ parts: [{ type: "text" }] }]), false);
  assert.equal(
    isAgentAccessAuthorized({
      agentMode: false,
      supportsTools: true,
      monthlyAgentRuns: 500,
      agentRunsUsed: 0,
      quotaAllowed: true,
    }),
    false
  );
});

test("pending tool approvals defer the single Agent run charge", () => {
  assert.equal(
    hasPendingToolApproval([
      {
        role: "assistant",
        parts: [{ type: "tool-getWeather", state: "approval-requested" }],
      },
    ]),
    true
  );
  assert.equal(
    hasPendingToolApproval([
      {
        role: "assistant",
        parts: [{ type: "tool-getWeather", state: "approval-responded" }],
      },
    ]),
    false
  );
});

test("Agent tools require a supported model, paid quota, and remaining usage", () => {
  const access = {
    agentMode: true,
    supportsTools: true,
    monthlyAgentRuns: 500,
    agentRunsUsed: 0,
    quotaAllowed: true,
  };

  assert.equal(isAgentAccessAuthorized(access), true);
  assert.equal(
    isAgentAccessAuthorized({ ...access, monthlyAgentRuns: 0 }),
    false
  );
  assert.equal(
    isAgentAccessAuthorized({ ...access, agentRunsUsed: 500 }),
    false
  );
  assert.equal(isAgentAccessAuthorized({ ...access, quotaAllowed: false }), false);
  assert.equal(isAgentAccessAuthorized({ ...access, supportsTools: false }), false);
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
