import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { guardLastActiveAgent, modelCredentialStatus, parseAgentPatch } from "@/lib/agents/agent-config";

/**
 * An agent's scopes are its authority, so these tests treat a rejected patch as the
 * important outcome. Each failure below is a way to widen authority by accident.
 */

describe("valid changes are accepted", () => {
  test("renaming is trimmed and bounded", () => {
    const result = parseAgentPatch({ displayName: "  Builder  " });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.patch.displayName, "Builder");
  });

  test("a single scope is accepted and deduplicated", () => {
    const result = parseAgentPatch({ scopes: ["task:read", "task:read", "task:create"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.patch.scopes, ["task:read", "task:create"]);
  });

  test("disabling is a status, not a deletion", () => {
    const result = parseAgentPatch({ status: "disabled" });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.patch.status, "disabled");
  });
});

describe("authority cannot be widened by accident", () => {
  test("an unknown scope is refused, and named", () => {
    const result = parseAgentPatch({ scopes: ["task:read", "task:*"] });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /unknown_scopes:task:\*/);
  });

  test("an empty scope list is refused rather than silently granting nothing", () => {
    const result = parseAgentPatch({ scopes: [] });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "scopes_cannot_be_empty");
  });

  test("claim without report is refused: that agent could take work it never finishes", () => {
    const result = parseAgentPatch({ scopes: ["task:claim"] });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "task_claim_requires_task_report");
  });

  test("an unknown field is refused rather than ignored", () => {
    const result = parseAgentPatch({ displayName: "ok", model: "gpt-5" });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /unknown_fields:model/);
  });

  test("an unknown status is refused", () => {
    assert.equal(parseAgentPatch({ status: "paused" }).ok, false);
  });

  test("an empty patch says so instead of writing nothing", () => {
    const result = parseAgentPatch({});
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "empty_patch");
  });

  test("a non-object body is refused", () => {
    assert.equal(parseAgentPatch("disabled").ok, false);
    assert.equal(parseAgentPatch(null).ok, false);
    assert.equal(parseAgentPatch([]).ok, false);
  });
});

describe("a workspace keeps a way to execute work", () => {
  test("disabling the last active agent is refused", () => {
    const result = guardLastActiveAgent({ status: "disabled" }, 0);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "cannot_disable_last_active_agent");
  });

  test("disabling when another agent remains is allowed", () => {
    assert.equal(guardLastActiveAgent({ status: "disabled" }, 1).ok, true);
  });

  test("the guard does not interfere with other changes", () => {
    assert.equal(guardLastActiveAgent({ displayName: "Renamed" }, 0).ok, true);
  });
});

describe("model selection is validated before it is stored", () => {
  test("provider and model are accepted together", () => {
    const result = parseAgentPatch({ modelProvider: "anthropic", modelId: "claude-sonnet-4-5" });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.patch.modelProvider, "anthropic");
  });

  test("a provider without a model is refused", () => {
    const result = parseAgentPatch({ modelProvider: "anthropic" });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "model_provider_and_id_must_be_set_together");
  });

  test("a model without a provider is refused", () => {
    assert.equal(parseAgentPatch({ modelId: "gpt-5" }).ok, false);
  });

  test("an unsupported provider is refused rather than stored", () => {
    const result = parseAgentPatch({ modelProvider: "someones-api", modelId: "x-1" });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "unsupported_model_provider");
  });

  test("a model id with spaces or shell metacharacters is refused", () => {
    for (const modelId of ["has space", "semi;colon", "x", "dollar$(x)"]) {
      assert.equal(parseAgentPatch({ modelProvider: "ollama", modelId }).ok, false, modelId);
    }
  });

  test("both null means back to the deployment default, and is allowed", () => {
    const result = parseAgentPatch({ modelProvider: null, modelId: null });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.patch.modelProvider, null);
  });

  test("credentials are reported, not assumed", () => {
    assert.equal(modelCredentialStatus("ollama", {}).ok, true);
    assert.equal(modelCredentialStatus("anthropic", {}).ok, false);
    assert.equal(modelCredentialStatus("anthropic", { ANTHROPIC_API_KEY: "k" }).ok, true);
    assert.equal(modelCredentialStatus("gateway", {}).reason, "missing_gateway_credential");
    assert.equal(modelCredentialStatus("google", { GEMINI_API_KEY: "k" }).ok, true);
    assert.equal(modelCredentialStatus("openai-compatible", { MODEL_API_KEY: "k" }).ok, true);
    assert.equal(modelCredentialStatus("nope", {}).reason, "unsupported_provider");
  });
});
