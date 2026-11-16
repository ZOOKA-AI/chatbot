import "server-only";

import { and, desc, eq } from "drizzle-orm";

import * as queriesModule from "@/lib/db/queries";
import { commanderActiveDb } from "@/lib/db/tenant-context";
import { agentLaunchPlan } from "@/lib/db/schema";
import {
  buildLaunchPlan,
  startableOrder,
  type LaunchBrief,
  type LaunchPlan,
  type LaunchStep,
} from "@/lib/agents/launch-plan";

/**
 * A stored launch plan, and the state machine over it.
 *
 * The states are the whole point of this module. A plan that says "done" because it was
 * created is the failure mode the directive names, so nothing here can mark a step
 * completed except an explicit transition that a caller has to make, and creation starts
 * every step at PLANNED.
 *
 * Plan status is derived from step states rather than stored, so the summary can never
 * disagree with the steps it summarises.
 */

/**
 * The same lazy handle the Commander uses: reads resolve against the transaction
 * published for the current request, so a call made inside a tenant transaction is
 * subject to that tenant's policies, and falls back to the shared connection otherwise.
 * It is lazy so that touching the shared connection only happens if something uses it.
 */
const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
});

export type StepState = "PLANNED" | "READY" | "BLOCKED" | "AWAITING_APPROVAL" | "COMPLETED";

export type PlanStatus = "planned" | "in_progress" | "awaiting_approval" | "blocked" | "completed";

export type StoredStep = {
  id: string;
  title: string;
  detail: string;
  owner: LaunchStep["owner"];
  dependsOn: string[];
  gate?: string;
  state: StepState;
  /** Why the step is where it is, in the customer's terms. */
  reason?: string;
  updatedAt?: string;
};

export type StoredPlan = {
  id: string;
  organizationId: string;
  title: string;
  brief: LaunchBrief;
  steps: StoredStep[];
  status: PlanStatus;
  createdAt: string;
};

/**
 * The initial state of every step.
 *
 * A step whose dependencies are already satisfied and whose owner is the agent is READY.
 * An approval step is AWAITING_APPROVAL even before its dependencies clear, because the
 * customer needs to know a decision is coming - not discover it later.
 * A customer step is BLOCKED with the reason, because the platform genuinely cannot
 * proceed without them.
 */
export function initialState(plan: LaunchPlan): Record<string, StepState> {
  const states: Record<string, StepState> = {};
  for (const step of plan.steps) {
    if (step.owner === "approval") states[step.id] = "AWAITING_APPROVAL";
    else if (step.owner === "customer") states[step.id] = "BLOCKED";
    else states[step.id] = "PLANNED";
  }
  // An agent step with nothing to wait for is ready now, not merely planned.
  for (const step of plan.steps) {
    if (states[step.id] !== "PLANNED") continue;
    if (step.dependsOn.every((dependency) => plan.steps.find((s) => s.id === dependency)?.owner === "agent")) {
      states[step.id] = "READY";
    }
  }
  return states;
}

export function deriveStatus(steps: StoredStep[]): PlanStatus {
  if (steps.length === 0) return "planned";
  if (steps.every((step) => step.state === "COMPLETED")) return "completed";
  if (steps.some((step) => step.state === "AWAITING_APPROVAL")) return "awaiting_approval";
  if (steps.every((step) => step.state === "BLOCKED" || step.state === "COMPLETED")) return "blocked";
  if (steps.some((step) => step.state === "READY")) return "planned";
  return "in_progress";
}

function hydrate(plan: LaunchPlan, states: Record<string, StepState>, updatedAt = new Date().toISOString()): StoredStep[] {
  return plan.steps.map((step) => ({
    ...step,
    state: states[step.id] ?? "PLANNED",
    updatedAt,
  }));
}

export async function createStoredPlan(input: {
  organizationId: string;
  brief: LaunchBrief;
  connectedProviders?: string[];
  createdBy?: string;
}): Promise<StoredPlan> {
  const plan = buildLaunchPlan(input.brief, { connectedProviders: input.connectedProviders });
  const states = initialState(plan);
  const steps = hydrate(plan, states);
  const title = `Launch plan for ${input.brief.businessName}`;

  const [row] = await db
      .insert(agentLaunchPlan)
      .values({
        organizationId: input.organizationId,
        title,
        brief: input.brief as unknown as Record<string, unknown>,
        plan: plan as unknown as Record<string, unknown>,
        steps: Object.fromEntries(steps.map((step) => [step.id, step.state])),
        createdBy: input.createdBy ?? "owner",
      })
      .returning();

  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    brief: input.brief,
    steps,
    status: deriveStatus(steps),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getStoredPlan(input: { organizationId: string; planId: string }): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(agentLaunchPlan)
    .where(and(eq(agentLaunchPlan.id, input.planId), eq(agentLaunchPlan.organizationId, input.organizationId)))
    .limit(1);
  if (!row) return null;

  const plan = row.plan as unknown as LaunchPlan;
  const states = (row.steps ?? {}) as Record<string, StepState>;
  const steps = hydrate(plan, states, row.updatedAt.toISOString());
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    brief: row.brief as unknown as LaunchBrief,
    steps,
    status: deriveStatus(steps),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listStoredPlans(input: { organizationId: string; limit?: number }): Promise<StoredPlan[]> {
  const rows = await db
    .select()
    .from(agentLaunchPlan)
    .where(eq(agentLaunchPlan.organizationId, input.organizationId))
    .orderBy(desc(agentLaunchPlan.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 50));
  return rows.map((row) => {
    const plan = row.plan as unknown as LaunchPlan;
    const states = (row.steps ?? {}) as Record<string, StepState>;
    const steps = hydrate(plan, states, row.updatedAt.toISOString());
    return {
      id: row.id,
      organizationId: row.organizationId,
      title: row.title,
      brief: row.brief as unknown as LaunchBrief,
      steps,
      status: deriveStatus(steps),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * The only way a step becomes COMPLETED.
 *
 * It is a separate, explicit call rather than something that happens when a task is
 * queued, because a queued task has not produced anything yet. It also refuses to
 * complete a step whose dependencies are not complete, so the plan cannot record
 * "website published" before "website built".
 */
export async function setStepState(input: {
  organizationId: string;
  planId: string;
  stepId: string;
  state: StepState;
}): Promise<{ ok: boolean; error?: string; plan?: StoredPlan }> {
  const current = await getStoredPlan({ organizationId: input.organizationId, planId: input.planId });
  if (!current) return { ok: false, error: "not_found" };

  const target = current.steps.find((step) => step.id === input.stepId);
  if (!target) return { ok: false, error: "unknown_step" };

  if (input.state === "COMPLETED") {
    const unmet = target.dependsOn.filter(
      (dependency) => current.steps.find((s) => s.id === dependency)?.state !== "COMPLETED"
    );
    if (unmet.length > 0) return { ok: false, error: `dependency_not_complete:${unmet.join(",")}` };
  }

  const nextSteps = current.steps.map((step) =>
    step.id === input.stepId ? { ...step, state: input.state, updatedAt: new Date().toISOString() } : step
  );

  await db
    .update(agentLaunchPlan)
    .set({
      steps: Object.fromEntries(nextSteps.map((step) => [step.id, step.state])),
      updatedAt: new Date(),
    })
    .where(and(eq(agentLaunchPlan.id, input.planId), eq(agentLaunchPlan.organizationId, input.organizationId)));

  return {
    ok: true,
    plan: { ...current, steps: nextSteps, status: deriveStatus(nextSteps) },
  };
}

/** The order the plan says work should start in, exposed so a UI can show "next". */
export function nextStep(plan: StoredPlan): StoredStep | null {
  const order = startableOrder(plan as unknown as LaunchPlan);
  for (const id of order) {
    const step = plan.steps.find((candidate) => candidate.id === id);
    if (step && step.state === "READY") return step;
  }
  return null;
}
