import { describe, expect, it } from "vitest";

import {
  classifyRisk,
  estimateCost,
  idempotencyKey,
  preflightAction,
} from "@/lib/actions/preflight";
import type { ActionTemplate } from "@/lib/actions/catalog";

const template = (over: Partial<ActionTemplate> = {}): ActionTemplate => ({
  schemaVersion: 1,
  id: "repo_status",
  version: 1,
  category: "engineering",
  title: { ar: "حالة المستودع", en: "Repository status" },
  description: { ar: "قراءة", en: "Reads" },
  inputs: [
    {
      key: "repo",
      label: { ar: "المستودع", en: "Repository" },
      help: { ar: "المستودع المصرّح به", en: "The authorised repository" },
      type: "text",
      required: true,
    },
  ],
  responsibleRole: "engineer",
  requiredTools: ["github_repo_inspect"],
  requiredIntegrations: ["github"],
  approval: "none",
  workflow: [{ ar: "قراءة", en: "Read" }],
  outputs: [{ ar: "ملخص", en: "Summary" }],
  executable: true,
  ...over,
});

const base = {
  assignedTools: ["github_repo_inspect", "project_document_create"],
  agentStatus: "active",
  plan: "pro" as const,
  agentRunsUsed: 0,
  organizationId: "org_tenant_a",
};

describe("preflight risk classification", () => {
  it("runs a read-only action without asking", () => {
    const result = preflightAction({ ...base, template: template() });
    expect(result.decision).toBe("execute");
    if (result.decision === "deny") throw new Error("unexpected denial");
    expect(result.risk).toBe("low");
    expect(result.cost.readOnly).toBe(true);
  });

  it("asks for confirmation when a tool writes but the catalogue allows it", () => {
    const result = preflightAction({
      ...base,
      template: template({ requiredTools: ["project_document_create"] }),
    });
    expect(result.decision).toBe("confirm");
    if (result.decision === "deny") throw new Error("unexpected denial");
    expect(result.risk).toBe("medium");
    expect(result.cost.readOnly).toBe(false);
  });

  it("stops for approval when the catalogue requires it, even for a read tool", () => {
    const result = preflightAction({
      ...base,
      template: template({ approval: "required" }),
    });
    expect(result.decision).toBe("approve");
    if (result.decision === "deny") throw new Error("unexpected denial");
    expect(result.risk).toBe("high");
    expect(result.reasons).toContain("catalogue_requires_approval");
  });

  it("cannot lower a tier the catalogue guards", () => {
    const cost = estimateCost(template());
    expect(classifyRisk({ approval: "required", cost })).toBe("high");
    expect(classifyRisk({ approval: "none", cost })).toBe("low");
  });
});

describe("preflight denials", () => {
  it("passes the plan refusal through unchanged when the allowance is spent", () => {
    const result = preflightAction({
      ...base,
      agentRunsUsed: 10_000,
      template: template(),
    });
    expect(result.decision).toBe("deny");
    if (result.decision !== "deny") throw new Error("expected denial");
    expect(result.error).toBe("run_allowance_exhausted");
    expect(result.detail).toContain("agent runs");
  });

  it("refuses a plan the entitlement table does not know", () => {
    const result = preflightAction({
      ...base,
      plan: "does_not_exist" as never,
      template: template(),
    });
    expect(result.decision).toBe("deny");
    if (result.decision !== "deny") throw new Error("expected denial");
    expect(result.error).toBe("plan_does_not_include_agent_runs");
  });

  it("refuses an inactive agent", () => {
    const result = preflightAction({
      ...base,
      agentStatus: "paused",
      template: template(),
    });
    expect(result.decision).toBe("deny");
    if (result.decision !== "deny") throw new Error("expected denial");
    expect(result.error).toBe("assigned_agent_inactive");
  });

  it("refuses a tool the project's agent was not assigned", () => {
    const result = preflightAction({
      ...base,
      assignedTools: ["project_document_create"],
      template: template(),
    });
    expect(result.decision).toBe("deny");
    if (result.decision !== "deny") throw new Error("expected denial");
    expect(result.error).toBe("tool_not_assigned");
  });
});

describe("preflight cost and idempotency", () => {
  it("counts one agent run and every distinct tool", () => {
    const cost = estimateCost(
      template({ requiredTools: ["github_repo_inspect", "github_repo_inspect", "project_document_create"] })
    );
    expect(cost.agentRuns).toBe(1);
    expect(cost.toolCalls).toBe(2);
    expect(cost.writingTools).toEqual(["project_document_create"]);
  });

  it("gives the same key for the same request regardless of key order", () => {
    const a = idempotencyKey({
      organizationId: "org_tenant_a",
      actionId: "repo_status",
      inputs: { repo: "ZOOKA-AI/chatbot", branch: "main" },
    });
    const b = idempotencyKey({
      organizationId: "org_tenant_a",
      actionId: "repo_status",
      inputs: { branch: "main", repo: "ZOOKA-AI/chatbot" },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never lets one workspace's key stand in for another's", () => {
    const a = idempotencyKey({ organizationId: "org_tenant_a", actionId: "repo_status", inputs: {} });
    const b = idempotencyKey({ organizationId: "org_tenant_b", actionId: "repo_status", inputs: {} });
    expect(a).not.toBe(b);
  });
});
