import { createHash } from "node:crypto";

import { toolCatalog } from "@/lib/agents/agent-tools";

import { planActionExecution, type ActionPlanInput } from "./run";

/**
 * The decision that sits between "the user asked for something" and "a task is queued".
 *
 * This does not re-decide what `planActionExecution` already decides. It calls it and
 * translates the answer into the four outcomes the agent-first interface needs, and adds
 * the two things a queued task needs and did not have: what it will cost, and a key that
 * makes a repeat request the same request instead of a second one.
 *
 * Why a risk tier when the catalogue already carries an approval flag: the flag answers
 * "must a human approve", which is one bit. The interface has to answer three questions
 * before running anything - can I just do it, should I confirm first, or do I need an
 * explicit approval - and it has to say why. Deriving the tier from the flag and from
 * whether the tools write keeps a single source of truth: no action can be labelled high
 * risk here and auto-run there.
 */

export const RISK_TIERS = ["low", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export type Decision = "execute" | "confirm" | "approve" | "deny";

export type CostEstimate = {
  /** Agent runs this execution consumes from the workspace's monthly allowance. */
  agentRuns: number;
  /** Distinct tools the execution will call. Each one may reach an external service. */
  toolCalls: number;
  /** Tools that change something outside this workspace, so a failure costs more than a retry. */
  writingTools: string[];
  /** True when every tool only reads. A read can be retried freely; a write cannot. */
  readOnly: boolean;
};

export type PreflightInput = ActionPlanInput & {
  /** Normalised action inputs. Only used for the idempotency key, never logged. */
  inputs?: unknown;
  /** The workspace the caller was authenticated into, used to scope the key. */
  organizationId: string;
};

export type PreflightResult =
  | {
      decision: "execute" | "confirm" | "approve";
      risk: RiskTier;
      /** Stable for the same workspace, action and inputs inside the duplicate window. */
      idempotencyKey: string;
      cost: CostEstimate;
      reasons: string[];
    }
  | { decision: "deny"; error: string; detail?: string; reasons: string[] };

function writingTools(): Set<string> {
  return new Set(
    toolCatalog()
      .filter((tool) => tool.writes)
      .map((tool) => tool.id)
  );
}

/**
 * Deterministic key for "this exact request". A retry of the same click inside the
 * duplicate window produces the same key, so the caller can collapse it; a different
 * workspace or a different input produces a different one, so one tenant's key can never
 * suppress another tenant's work.
 */
export function idempotencyKey(input: {
  organizationId: string;
  actionId: string;
  inputs?: unknown;
}): string {
  const canonical = stableStringify(input.inputs ?? null);
  return createHash("sha256")
    .update(`${input.organizationId}\u0000${input.actionId}\u0000${canonical}`)
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function estimateCost(template: ActionPlanInput["template"]): CostEstimate {
  const writes = writingTools();
  const writing = template.requiredTools.filter((tool) => writes.has(tool));
  return {
    agentRuns: 1,
    toolCalls: new Set(template.requiredTools).size,
    writingTools: writing,
    readOnly: writing.length === 0,
  };
}

/**
 * Low: every tool only reads, so a wrong answer costs a retry and nothing else.
 * Medium: a tool writes, but the catalogue judged it safe enough to run without approval.
 * High: the catalogue requires approval. That flag is the only definition of high risk;
 *       nothing here can invent a lower tier for an action the catalogue guards.
 */
export function classifyRisk(input: {
  approval: ActionPlanInput["template"]["approval"];
  cost: CostEstimate;
}): RiskTier {
  if (input.approval === "required") return "high";
  if (!input.cost.readOnly) return "medium";
  return "low";
}

export function preflightAction(input: PreflightInput): PreflightResult {
  const plan = planActionExecution(input);

  if (!plan.ok) {
    // The refusal is passed through unchanged, including its message. A denial must read
    // the same here as it will if the caller somehow reaches execution anyway.
    return { decision: "deny", error: plan.error, detail: plan.detail, reasons: [plan.error] };
  }

  const cost = estimateCost(input.template);
  const risk = classifyRisk({ approval: input.template.approval, cost });
  const key = idempotencyKey({
    organizationId: input.organizationId,
    actionId: input.template.id,
    inputs: input.inputs,
  });

  const reasons: string[] = [`risk_${risk}`];
  if (input.template.approval === "required") reasons.push("catalogue_requires_approval");
  if (cost.readOnly) reasons.push("read_only");
  else reasons.push(`writes:${cost.writingTools.join("+")}`);
  if (plan.legacyUnrestrictedAgent) reasons.push("agent_unrestricted");

  const decision: "execute" | "confirm" | "approve" =
    risk === "high" ? "approve" : risk === "medium" ? "confirm" : "execute";

  return { decision, risk, idempotencyKey: key, cost, reasons };
}
