import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import {
  agentApproval,
  agentDecision,
  agentDeployment,
  agentIdentity,
  agentTask,
} from "@/lib/db/schema";
import { db } from "@/lib/db/queries";

/**
 * ZOOKA AGENT COMMAND CENTER — shared coordination state for every agent.
 *
 * Design rules that keep this safe to expose:
 * - each agent gets its own key; only `sha256(key)` is ever stored, and the
 *   plaintext is returned exactly once at registration;
 * - every write requires an active identity with the needed scope;
 * - task claiming is a single conditional UPDATE, so two agents can never
 *   win the same task;
 * - nothing here stores conversation content or user secrets.
 */

export const AGENT_SCOPES = [
  "task:read",
  "task:claim",
  "task:report",
  "decision:write",
  "approval:request",
  "deployment:write",
  "heartbeat",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

const LIVENESS_WINDOW_MINUTES = 10;

function hashKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateAgentKey() {
  return `zk_${randomBytes(32).toString("base64url")}`;
}

export type AgentIdentity = {
  id: string;
  organizationId: string;
  slug: string;
  displayName: string;
  role: string;
  scopes: string[];
  environment: string;
  status: string;
  lastSeenAt: Date | null;
};

/** Resolves a bearer key to an active identity, or null. */
export async function authenticateAgent(request: Request): Promise<AgentIdentity | null> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : request.headers.get("x-agent-key")?.trim() ?? "";
  if (!key) {
    return null;
  }

  const [row] = await db
    .select({
      id: agentIdentity.id,
      organizationId: agentIdentity.organizationId,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      scopes: agentIdentity.scopes,
      environment: agentIdentity.environment,
      status: agentIdentity.status,
      lastSeenAt: agentIdentity.lastSeenAt,
    })
    .from(agentIdentity)
    .where(and(eq(agentIdentity.keyHash, hashKey(key)), eq(agentIdentity.status, "active")))
    .limit(1);

  return row ?? null;
}

export function hasScope(agent: AgentIdentity, scope: AgentScope) {
  return Array.isArray(agent.scopes) && agent.scopes.includes(scope);
}

export type RegisterInput = {
  organizationId: string;
  slug: string;
  displayName: string;
  role: string;
  scopes?: string[];
  environment?: "production" | "preview" | "development";
};

/** Creates an identity and returns its key exactly once. */
export async function registerAgent(input: RegisterInput) {
  const key = generateAgentKey();
  const scopes = (input.scopes ?? [...AGENT_SCOPES]).filter((scope) =>
    (AGENT_SCOPES as readonly string[]).includes(scope)
  );

  const [row] = await db
    .insert(agentIdentity)
    .values({
      organizationId: input.organizationId,
      slug: input.slug.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 64),
      displayName: input.displayName.slice(0, 120),
      role: input.role.slice(0, 64),
      keyHash: hashKey(key),
      scopes: scopes.length > 0 ? scopes : [...AGENT_SCOPES],
      environment: input.environment ?? "production",
    })
    .returning({
      id: agentIdentity.id,
      organizationId: agentIdentity.organizationId,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      scopes: agentIdentity.scopes,
      environment: agentIdentity.environment,
      status: agentIdentity.status,
      lastSeenAt: agentIdentity.lastSeenAt,
    });

  return { agent: row as AgentIdentity, key };
}

export async function listAgents(organizationId: string) {
  return db
    .select({
      id: agentIdentity.id,
      organizationId: agentIdentity.organizationId,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      scopes: agentIdentity.scopes,
      environment: agentIdentity.environment,
      status: agentIdentity.status,
      lastSeenAt: agentIdentity.lastSeenAt,
      createdAt: agentIdentity.createdAt,
    })
    .from(agentIdentity)
    .where(eq(agentIdentity.organizationId, organizationId))
    .orderBy(desc(agentIdentity.createdAt));
}

export async function heartbeat(agent: AgentIdentity) {
  await db
    .update(agentIdentity)
    .set({ lastSeenAt: new Date() })
    .where(eq(agentIdentity.id, agent.id));
  return { ok: true, agent: agent.slug, at: new Date().toISOString() };
}

export async function commandCenterStatus(organizationId: string) {
  const since = new Date(Date.now() - LIVENESS_WINDOW_MINUTES * 60_000);

  const [agents] = await db
    .select({
      total: sql<number>`count(*)::int`,
      live: sql<number>`count(*) filter (where ${agentIdentity.lastSeenAt} >= ${since})::int`,
    })
    .from(agentIdentity)
    .where(
      and(
        eq(agentIdentity.status, "active"),
        eq(agentIdentity.organizationId, organizationId)
      )
    );

  const taskCounts = await db
    .select({
      status: agentTask.status,
      count: sql<number>`count(*)::int`,
    })
    .from(agentTask)
    .where(eq(agentTask.organizationId, organizationId))
    .groupBy(agentTask.status);

  const [approvals] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(agentApproval)
    .where(
      and(
        eq(agentApproval.status, "pending"),
        eq(agentApproval.organizationId, organizationId)
      )
    );

  const [deployments] = await db
    .select({ last: sql<string | null>`max(${agentDeployment.createdAt})::text` })
    .from(agentDeployment)
    .where(eq(agentDeployment.organizationId, organizationId));

  return {
    livenessWindowMinutes: LIVENESS_WINDOW_MINUTES,
    agents: agents ?? { total: 0, live: 0 },
    tasks: Object.fromEntries(taskCounts.map((row) => [row.status, row.count])),
    pendingApprovals: approvals?.pending ?? 0,
    lastDeploymentAt: deployments?.last ?? null,
  };
}

export type CreateTaskInput = {
  organizationId: string;
  title: string;
  instruction: string;
  ownerAgentId?: string | null;
  priority?: "low" | "normal" | "high" | "critical";
  dependencies?: string[];
  environment?: string;
  approvalRequired?: boolean;
  rollbackPlan?: string | null;
  createdBy?: string;
};

export async function createTask(input: CreateTaskInput) {
  const [row] = await db
    .insert(agentTask)
    .values({
      organizationId: input.organizationId,
      title: input.title.slice(0, 200),
      instruction: input.instruction.slice(0, 8000),
      ownerAgentId: input.ownerAgentId ?? null,
      priority: input.priority ?? "normal",
      dependencies: input.dependencies ?? [],
      environment: input.environment ?? "production",
      approvalRequired: input.approvalRequired ?? false,
      rollbackPlan: input.rollbackPlan ?? null,
      createdBy: input.createdBy ?? "owner",
    })
    .returning();
  return row;
}

export async function listTasks(options: {
  organizationId: string;
  status?: string;
  ownerAgentId?: string;
  limit?: number;
  available?: boolean;
}) {
  const filters: (ReturnType<typeof eq> | undefined)[] = [
    eq(agentTask.organizationId, options.organizationId),
  ];
  if (options.status) {
    filters.push(eq(agentTask.status, options.status));
  }
  if (options.ownerAgentId) {
    filters.push(eq(agentTask.ownerAgentId, options.ownerAgentId));
  }
  if (options.available) {
    filters.push(eq(agentTask.status, "pending"));
    filters.push(or(isNull(agentTask.ownerAgentId), eq(agentTask.status, "pending")));
  }

  return db
    .select()
    .from(agentTask)
    .where(and(...filters))
    .orderBy(desc(agentTask.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

/**
 * Atomic claim. The WHERE clause includes the current status and an unowned
 * (or self-owned) row, so exactly one caller can transition pending -> claimed.
 */
export async function claimTask(agent: AgentIdentity, taskId: string) {
  const [target] = await db
    .select({
      approvalRequired: agentTask.approvalRequired,
      status: agentTask.status,
    })
    .from(agentTask)
    .where(
      and(
        eq(agentTask.id, taskId),
        eq(agentTask.organizationId, agent.organizationId)
      )
    )
    .limit(1);

  if (!target) {
    return { ok: false as const, error: "task_not_found" };
  }
  if (target.approvalRequired) {
    const state = await approvalState(taskId, agent.organizationId);
    if (state !== "approved") {
      return {
        ok: false as const,
        error: state === "rejected" ? "approval_rejected" : "approval_required",
      };
    }
  }

  const claimed = await db
    .update(agentTask)
    .set({
      status: "in_progress",
      ownerAgentId: agent.id,
      claimedAt: new Date(),
    })
    .where(
      and(
        eq(agentTask.id, taskId),
        eq(agentTask.organizationId, agent.organizationId),
        eq(agentTask.status, "pending"),
        or(isNull(agentTask.ownerAgentId), eq(agentTask.ownerAgentId, agent.id))
      )
    )
    .returning();

  if (claimed.length === 0) {
    const [current] = await db
      .select({
        status: agentTask.status,
        ownerAgentId: agentTask.ownerAgentId,
        title: agentTask.title,
      })
      .from(agentTask)
      .where(
        and(
          eq(agentTask.id, taskId),
          eq(agentTask.organizationId, agent.organizationId)
        )
      )
      .limit(1);

    if (!current) {
      return { ok: false as const, error: "task_not_found" };
    }
    return {
      ok: false as const,
      error: "task_already_claimed",
      status: current.status,
      ownerAgentId: current.ownerAgentId,
    };
  }

  return { ok: true as const, task: claimed[0] };
}

/**
 * A task that needs approval cannot be worked on until that approval exists and
 * is approved, and cannot be completed after it was rejected. Both checks read
 * the same organisation, so another tenant's approval can never unlock a task.
 */
async function approvalState(taskId: string, organizationId: string) {
  const rows = await db
    .select({ status: agentApproval.status })
    .from(agentApproval)
    .where(
      and(
        eq(agentApproval.taskId, taskId),
        eq(agentApproval.organizationId, organizationId)
      )
    )
    .orderBy(desc(agentApproval.createdAt))
    .limit(1);

  return rows[0]?.status ?? null;
}

export type ReportInput = {
  taskId: string;
  status: "completed" | "failed" | "blocked";
  evidence: string;
};

export async function reportTask(agent: AgentIdentity, input: ReportInput) {
  const [target] = await db
    .select({ approvalRequired: agentTask.approvalRequired })
    .from(agentTask)
    .where(
      and(
        eq(agentTask.id, input.taskId),
        eq(agentTask.organizationId, agent.organizationId)
      )
    )
    .limit(1);

  if (!target) {
    return null;
  }
  if (target.approvalRequired && input.status === "completed") {
    const state = await approvalState(input.taskId, agent.organizationId);
    if (state !== "approved") {
      return null;
    }
  }

  // A report may only settle work that is still open. Without this guard a
  // cancelled task could be flipped back to "completed" by the agent that was
  // executing it when the owner cancelled, and a finished result could be
  // overwritten afterwards, which breaks the audit trail.
  const [row] = await db
    .update(agentTask)
    .set({
      status: input.status,
      evidence: input.evidence.slice(0, 8000),
      reportedAt: new Date(),
    })
    .where(
      and(
        eq(agentTask.id, input.taskId),
        eq(agentTask.ownerAgentId, agent.id),
        eq(agentTask.organizationId, agent.organizationId),
        inArray(agentTask.status, ["in_progress", "pending", "failed"])
      )
    )
    .returning();

  return row ?? null;
}

export async function listDecisions(organizationId: string, limit = 50) {
  return db
    .select()
    .from(agentDecision)
    .where(eq(agentDecision.organizationId, organizationId))
    .orderBy(desc(agentDecision.createdAt))
    .limit(Math.min(limit, 200));
}

export async function recordDecision(
  agent: AgentIdentity | null,
  input: {
    organizationId: string;
    title: string;
    body: string;
    state?: string;
    taskId?: string | null;
  }
) {
  const [row] = await db
    .insert(agentDecision)
    .values({
      organizationId: input.organizationId,
      agentId: agent?.id ?? null,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 8000),
      state: input.state ?? "PROPOSED",
      taskId: input.taskId ?? null,
    })
    .returning();
  return row;
}

export async function requestApproval(
  agent: AgentIdentity,
  input: { organizationId: string; taskId?: string | null; reason: string }
) {
  const [row] = await db
    .insert(agentApproval)
    .values({
      organizationId: input.organizationId,
      taskId: input.taskId ?? null,
      requestedBy: agent.id,
      reason: input.reason.slice(0, 4000),
    })
    .returning();
  return row;
}

export async function listDeployments(organizationId: string, limit = 50) {
  return db
    .select()
    .from(agentDeployment)
    .where(eq(agentDeployment.organizationId, organizationId))
    .orderBy(desc(agentDeployment.createdAt))
    .limit(Math.min(limit, 200));
}

export async function recordDeployment(
  agent: AgentIdentity,
  input: {
    organizationId: string;
    environment?: string;
    commitSha?: string | null;
    deploymentId?: string | null;
    status?: string;
    notes?: string | null;
    rollbackOf?: string | null;
  }
) {
  const [row] = await db
    .insert(agentDeployment)
    .values({
      organizationId: input.organizationId,
      environment: input.environment ?? "production",
      commitSha: input.commitSha ?? null,
      deploymentId: input.deploymentId ?? null,
      status: input.status ?? "pending",
      notes: input.notes ?? null,
      rollbackOf: input.rollbackOf ?? null,
      agentId: agent.id,
    })
    .returning();
  return row;
}

export async function recentAgentActivity(organizationId: string, limit = 20) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .select({
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      lastSeenAt: agentIdentity.lastSeenAt,
      status: agentIdentity.status,
    })
    .from(agentIdentity)
    .where(
      and(
        gte(agentIdentity.lastSeenAt, since),
        eq(agentIdentity.organizationId, organizationId)
      )
    )
    .orderBy(desc(agentIdentity.lastSeenAt))
    .limit(limit);
}

export async function listApprovals(
  organizationId: string,
  options: { status?: string; limit?: number } = {}
) {
  const filters: (ReturnType<typeof eq> | undefined)[] = [
    eq(agentApproval.organizationId, organizationId),
  ];
  if (options.status) {
    filters.push(eq(agentApproval.status, options.status));
  }
  return db
    .select()
    .from(agentApproval)
    .where(and(...filters))
    .orderBy(desc(agentApproval.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

/**
 * A decision is a single conditional UPDATE: the row must still be pending and
 * must belong to the caller's organisation. Two decisions cannot both win, and
 * a decision on another tenant's approval matches no row.
 */
export async function decideApproval(input: {
  organizationId: string;
  approvalId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
}) {
  const [row] = await db
    .update(agentApproval)
    .set({
      status: input.decision,
      decidedBy: input.decidedBy.slice(0, 64),
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(agentApproval.id, input.approvalId),
        eq(agentApproval.organizationId, input.organizationId),
        eq(agentApproval.status, "pending")
      )
    )
    .returning();

  return row ?? null;
}

export async function cancelTask(input: {
  organizationId: string;
  taskId: string;
  reason: string;
  by: string;
}) {
  const [row] = await db
    .update(agentTask)
    .set({ status: "cancelled", evidence: input.reason.slice(0, 8000) })
    .where(
      and(
        eq(agentTask.id, input.taskId),
        eq(agentTask.organizationId, input.organizationId),
        or(eq(agentTask.status, "pending"), eq(agentTask.status, "in_progress"))
      )
    )
    .returning();

  return row ?? null;
}
