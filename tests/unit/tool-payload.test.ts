import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { defaultToolPayload, toolPayloadFor } from "@/lib/agents/tool-payload";

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

  test("the defaults are copied, so a caller mutating one does not poison the next", () => {
    const first = defaultToolPayload("github_repo_inspect");
    first.repo = "mutated/mutated";
    assert.equal(defaultToolPayload("github_repo_inspect").repo, "zooka-ai/chatbot");
  });
});
