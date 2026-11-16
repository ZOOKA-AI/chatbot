import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

// The module under test is server-side only; the guard is meaningless in this context.
vi.mock("server-only", () => ({}));

import { agentAllowsTool, describeToolAssignment } from "@/lib/agents/agent-tools";

/**
 * Tool assignment states.
 *
 * A new agent starts with an empty list, so "nothing assigned" must refuse every tool. Only the
 * pre-existing NULL state keeps the old unrestricted behaviour, and it is reported under its own
 * name so an audit can find those identities instead of mistaking them for configured agents.
 */
describe("describeToolAssignment", () => {
  test("an empty list is restricted and permits nothing", () => {
    const state = describeToolAssignment({ allowedTools: [] });
    assert.equal(state.mode, "restricted");
    assert.deepEqual(state.tools, []);
  });

  test("null is reported as legacy_unrestricted, not as a normal configuration", () => {
    assert.equal(describeToolAssignment({ allowedTools: null }).mode, "legacy_unrestricted");
    assert.equal(describeToolAssignment({}).mode, "legacy_unrestricted");
  });

  test("a malformed value is restricted, not legacy", () => {
    assert.equal(describeToolAssignment({ allowedTools: "github_repo_inspect" }).mode, "restricted");
    assert.deepEqual(describeToolAssignment({ allowedTools: { 0: "x" } }).tools, []);
  });

  test("non-string members are dropped rather than trusted", () => {
    assert.deepEqual(describeToolAssignment({ allowedTools: ["a", 1, null, "b"] }).tools, ["a", "b"]);
  });
});

describe("agentAllowsTool with the new default", () => {
  test("a freshly created agent may run no tool", () => {
    const fresh = { allowedTools: [] };
    assert.equal(agentAllowsTool(fresh, "github_repo_inspect"), false);
    assert.equal(agentAllowsTool(fresh, "vercel_deployment_inspect"), false);
  });

  test("granting one tool does not grant another", () => {
    const assigned = { allowedTools: ["github_repo_inspect"] };
    assert.equal(agentAllowsTool(assigned, "github_repo_inspect"), true);
    assert.equal(agentAllowsTool(assigned, "vercel_deployment_inspect"), false);
  });
});

describe("permission is read at execution time", () => {
  test("removing a tool changes the answer without a restart", () => {
    // The same stored row, read twice: the worker calls this on every execution, so a list
    // edited after a task was queued governs that task too.
    const agent = { allowedTools: ["github_repo_inspect"] };
    assert.equal(agentAllowsTool(agent, "github_repo_inspect"), true);
    agent.allowedTools = [];
    assert.equal(agentAllowsTool(agent, "github_repo_inspect"), false);
  });
});
