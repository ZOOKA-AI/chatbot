import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

// The catalog is server code by design; the marker module is stubbed so the contract can be
// tested directly rather than through a request.
vi.mock("server-only", () => ({}));

import {
  ACTION_CATALOG_VERSION,
  ACTION_TEMPLATES,
  actionPayload,
  actionsExecutableBy,
  findAction,
  parseActionInputs,
  type ActionTemplate,
} from "@/lib/actions/catalog";
import { planActionExecution } from "@/lib/actions/run";
import { isKnownTool, toolCatalog } from "@/lib/agents/agent-tools";

/**
 * The catalog is a contract with the worker, so these tests hold it to the worker's own registry:
 * an action may not name a tool that does not exist, and may not claim to be executable unless
 * every tool it needs is really implemented.
 */

const githubAction = findAction("repo_health_report")!;

function templateLike(patch: Partial<ActionTemplate>): ActionTemplate {
  return { ...githubAction, ...patch };
}

describe("every published template is internally consistent", () => {
  test("each one satisfies the versioned schema", () => {
    for (const template of ACTION_TEMPLATES) {
      assert.equal(template.schemaVersion, ACTION_CATALOG_VERSION);
      assert.ok(template.version >= 1);
    }
  });

  test("ids are unique, so a run always resolves to one template", () => {
    const ids = ACTION_TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every template is described in both languages", () => {
    for (const template of ACTION_TEMPLATES) {
      assert.ok(template.title.ar.length > 1 && template.title.en.length > 1, template.id);
      assert.ok(template.description.ar.length > 10 && template.description.en.length > 10, template.id);
    }
  });

  test("no template names a tool the worker does not implement", () => {
    for (const template of ACTION_TEMPLATES) {
      for (const tool of template.requiredTools) {
        assert.ok(isKnownTool(tool), `${template.id} names unknown tool ${tool}`);
        assert.ok(toolCatalog().some((entry) => entry.id === tool));
      }
    }
  });

  test("executable is derived, never asserted", () => {
    for (const template of ACTION_TEMPLATES) {
      assert.equal(template.executable, template.requiredTools.every((tool) => isKnownTool(tool)));
    }
    assert.equal(ACTION_TEMPLATES.filter((template) => template.executable).length, ACTION_TEMPLATES.length);
  });
});

describe("input validation refuses what it cannot honour", () => {
  test("a missing required input is named, not generically refused", () => {
    const result = parseActionInputs(githubAction, {});
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "missing_repo");
  });

  test("an undeclared input is refused rather than dropped", () => {
    const result = parseActionInputs(githubAction, { repo: "a/b", secret: "x" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unknown_inputs");
  });

  test("the declared pattern is enforced", () => {
    assert.equal(parseActionInputs(githubAction, { repo: "not a repo" }).ok, false);
    assert.equal(parseActionInputs(githubAction, { repo: "<script>" }).ok, false);
    const good = parseActionInputs(githubAction, { repo: "ZOOKA-AI/chatbot" });
    assert.equal(good.ok, true);
    assert.deepEqual(good.ok === true && good.inputs, { repo: "ZOOKA-AI/chatbot" });
  });

  test("whitespace is trimmed, and a blank required value counts as missing", () => {
    assert.equal(parseActionInputs(githubAction, { repo: "   " }).ok, false);
    const trimmed = parseActionInputs(githubAction, { repo: "  ZOOKA-AI/chatbot  " });
    assert.equal(trimmed.ok === true && trimmed.inputs.repo, "ZOOKA-AI/chatbot");
  });
});

describe("the payload handed to the worker is exactly what the tool reads", () => {
  test("a github action sends only the repo key", () => {
    const { tool, payload } = actionPayload(githubAction, { repo: "ZOOKA-AI/chatbot" });
    assert.equal(tool, "github_repo_inspect");
    assert.deepEqual(payload, { repo: "ZOOKA-AI/chatbot" });
  });

  test("a vercel action sends only the project key", () => {
    const vercel = findAction("deployment_status_report")!;
    const { tool, payload } = actionPayload(vercel, { project: "chatbot" });
    assert.equal(tool, "vercel_deployment_inspect");
    assert.deepEqual(payload, { project: "chatbot" });
  });
});

describe("assignment decides what can run", () => {
  test("an agent assigned the tool may run the action", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.tool, "github_repo_inspect");
    assert.equal(result.ok === true && result.approvalRequired, false);
  });

  test("an agent without the tool is refused, with a reason the owner can act on", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: ["vercel_deployment_inspect"],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "tool_not_assigned");
  });

  test("an empty assignment refuses everything", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: [],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok === false && result.error, "tool_not_assigned");
  });

  test("a disabled agent is refused even when it holds the tool", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "disabled",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok === false && result.error, "assigned_agent_inactive");
  });
});

describe("spend is bounded by the plan rather than assumed", () => {
  test("a plan without agent runs refuses the action", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "active",
      plan: "free",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok === false && result.error, "plan_does_not_include_agent_runs");
  });

  test("an exhausted allowance refuses before a task exists", () => {
    const result = planActionExecution({
      template: githubAction,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 99_999,
    });
    assert.equal(result.ok === false && result.error, "run_allowance_exhausted");
  });
});

describe("approval is a property of the template, not of the caller", () => {
  test("a template that requires approval plans a gated task", () => {
    const gated = templateLike({ approval: "required" });
    const result = planActionExecution({
      template: gated,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok === true && result.approvalRequired, true);
  });

  test("a template whose tool is missing can never be planned", () => {
    const broken = templateLike({ executable: false });
    const result = planActionExecution({
      template: broken,
      assignedTools: ["github_repo_inspect"],
      agentStatus: "active",
      plan: "pro",
      agentRunsUsed: 0,
    });
    assert.equal(result.ok === false && result.error, "action_not_executable");
  });
});

describe("discovery filters on what the agent can actually do", () => {
  test("only actions whose tools are all assigned are listed as runnable", () => {
    const runnable = actionsExecutableBy(["github_repo_inspect"]);
    assert.deepEqual(
      runnable.map((action) => action.id),
      ["repo_health_report"]
    );
    assert.equal(actionsExecutableBy([]).length, 0);
  });
});
