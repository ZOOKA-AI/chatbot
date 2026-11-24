import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acceptedPayloadKeys, defaultToolPayload, toolPayloadFor } from "@/lib/agents/tool-payload";

/**
 * The regression this file exists for: the scheduler passed `{ repo }` to the GitHub tool
 * and the standalone worker passed nothing, so every task the worker executed failed at
 * `bad_repo_name` while the scheduler's runs succeeded. Both now read one payload.
 */

describe("tool payloads have one source", () => {
  test("the repository inspector always gets a repo", () => {
    assert.deepEqual(defaultToolPayload("github_repo_inspect"), { repo: "zooka-ai/chatbot" });
  });

  test("an unknown tool gets an empty payload rather than a guessed one", () => {
    assert.deepEqual(defaultToolPayload("not_a_tool"), {});
  });

  test("an override wins for a known key", () => {
    assert.deepEqual(toolPayloadFor("github_repo_inspect", { repo: "owner/other" }), { repo: "owner/other" });
  });

  test("an override cannot introduce keys the tool does not accept", () => {
    assert.deepEqual(toolPayloadFor("github_repo_inspect", { repo: "owner/other", token: "x" }), {
      repo: "owner/other",
    });

  });

  test("a named secret passes through without accepting a plaintext credential", () => {
    assert.deepEqual(toolPayloadFor("github_repo_probe", { secretName: "GITHUB_KEY", token: "x" }), {
      repo: "zooka-ai/chatbot",
      secretName: "GITHUB_KEY",
    });
  });

  test("a key the tool reads survives even when the tool has no default", () => {
    // The readiness report's only input is the customer's label. It used to be dropped here,
    // because the merge kept only keys that existed in the defaults, and the tool then failed
    // with invalid_label while the value sat in the task row.
    assert.deepEqual(toolPayloadFor("workspace_readiness_inspect", { label: "Launch readiness", tool: "x" }), {
      label: "Launch readiness",
    });
  });

  test("a document brief reaches the tool that writes it", () => {
    assert.deepEqual(
      toolPayloadFor("project_document_create", { title: "Scope", brief: "What we agreed", projectId: "p1" }),
      { title: "Scope", brief: "What we agreed", projectId: "p1" }
    );
  });

  test("a scheduled skill keeps its name but not an injected workspace", () => {
    assert.deepEqual(toolPayloadFor("load_skill", { name: "writing", organizationId: "other" }), {
      name: "writing",
    });
  });

  test("the accepted list is the defaults plus what the tool reads", () => {
    assert.deepEqual(acceptedPayloadKeys("github_repo_inspect"), ["repo", "paths"]);
    assert.deepEqual(acceptedPayloadKeys("github_repo_probe"), ["repo", "secretName"]);
    assert.deepEqual(acceptedPayloadKeys("workspace_readiness_inspect"), ["label"]);
  });

  test("the defaults are copied, so a caller mutating one does not poison the next", () => {
    const first = defaultToolPayload("github_repo_inspect");
    first.repo = "mutated/mutated";
    assert.equal(defaultToolPayload("github_repo_inspect").repo, "zooka-ai/chatbot");
  });
});
