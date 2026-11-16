import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  agentApproval,
  agentDecision,
  agentDeployment,
  agentIdentity,
  agentTask,
  agentExecution,
} from "@/lib/db/schema";
import * as queriesModule from "@/lib/db/queries";
import { commanderActiveDb } from "@/lib/db/tenant-context";
import type { Cursor } from "./pagination";
import { encodeCursor } from "./pagination";

/**
 * The handle every function below uses.
 *
 * Reads resolve against the transaction published for the current request, so a
 * Commander call made inside a tenant transaction is subject to that tenant's
 * policies. With nothing published it is the shared connection, unchanged.
 */
const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;

    // Read lazily: touching the shared connection is what an escape looks like,
    // so it must happen only if something actually uses it.
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);

    // Bind to the real handle. A transaction method called through the proxy
    // gets the proxy as `this`, loses its session, and returns nothing at all,
    // which is how the first atomic-decision attempt silently produced no row.
    return typeof value === "function" ? value.bind(source) : value;
  },
}) as typeof queriesModule.db;


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
  /**
   * The tool assignment, exactly as stored.
   *
   * `null` is a real value (legacy identity, unrestricted). It must be selected: omitting it made every
   * authenticated agent look policy-free, and the policy check read that absence as "allow everything".
   */
  allowedTools: string[] | null;
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
      allowedTools: agentIdentity.allowedTools,
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
      // An agent starts with no tools. NULL means "never configured" and keeps the legacy
      // unrestricted behaviour only for identities that predate tool assignment; a new agent
      // must be given a tool deliberately rather than inheriting every one.
      allowedTools: [],
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

/**
 * Applies an already-validated configuration change, scoped to the workspace.
 *
 * The `organizationId` predicate is part of the UPDATE rather than a check performed
 * beforehand: one statement cannot be raced by a request arriving between read and write.
 */
export async function updateAgentConfig(input: {
  organizationId: string;
  agentId: string;
  patch: {
    displayName?: string;
    status?: string;
    scopes?: string[];
    environment?: string;
    modelProvider?: string | null;
    modelId?: string | null;
    allowedTools?: string[] | null;
    instructions?: string | null;
  };
}) {
  // Every field the parser validated is written here. Model selection used to be accepted by
  // parseAgentPatch and dropped by this function, so a customer could choose a model, see no
  // error, and have the old value persisted.
  const [row] = await db
    .update(agentIdentity)
    .set({
      ...(input.patch.displayName === undefined ? {} : { displayName: input.patch.displayName }),
      ...(input.patch.status === undefined ? {} : { status: input.patch.status }),
      ...(input.patch.scopes === undefined ? {} : { scopes: input.patch.scopes }),
      ...(input.patch.environment === undefined ? {} : { environment: input.patch.environment }),
      ...(input.patch.modelProvider === undefined ? {} : { modelProvider: input.patch.modelProvider }),
      ...(input.patch.modelId === undefined ? {} : { modelId: input.patch.modelId }),
      ...(input.patch.allowedTools === undefined ? {} : { allowedTools: input.patch.allowedTools }),
      ...(input.patch.instructions === undefined ? {} : { instructions: input.patch.instructions }),
    })
    .where(
      and(
        eq(agentIdentity.id, input.agentId),
        eq(agentIdentity.organizationId, input.organizationId)
      )
    )
    .returning({
      id: agentIdentity.id,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      scopes: agentIdentity.scopes,
      environment: agentIdentity.environment,
      status: agentIdentity.status,
      modelProvider: agentIdentity.modelProvider,
      modelId: agentIdentity.modelId,
      allowedTools: agentIdentity.allowedTools,
      instructions: agentIdentity.instructions,
    });

  return row ?? null;
}

/** How many other agents in this workspace can still execute work. */
export async function countOtherActiveAgents(input: { organizationId: string; agentId: string }) {
  const rows = await db
    .select({ id: agentIdentity.id })
    .from(agentIdentity)
    .where(
      and(
        eq(agentIdentity.organizationId, input.organizationId),
        eq(agentIdentity.status, "active"),
        ne(agentIdentity.id, input.agentId)
      )
    );
  return rows.length;
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
  /** Which project the work belongs to, when it belongs to one. */
  projectId?: string | null;
  /** What the worker needs to run this: the tool id and its inputs, as the catalog declared them. */
  payload?: Record<string, unknown> | null;
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
      projectId: input.projectId ?? null,
      payload: input.payload ?? null,
      createdBy: input.createdBy ?? "owner",
    })
    .returning();
  return row;
}

/**
 * One task, by id, scoped to the organisation.
 *
 * Deliberately returns null for another tenant's task rather than an error, so a
 * caller cannot use the difference to learn that the row exists elsewhere.
 */
/**
 * The agent identity that a workspace's tasks are executed by, read through the
 * tenant handle. The scheduler runs cross-tenant selection but must not read a
 * workspace's rows on the shared connection.
 */
export async function firstAgentIdentity(organizationId: string) {
  const [row] = await db
    .select({
      id: agentIdentity.id,
      organizationId: agentIdentity.organizationId,
      // The scheduler runs tools without an HTTP request, so it needs the policy here or it has none.
      allowedTools: agentIdentity.allowedTools,
    })
    .from(agentIdentity)
    .where(eq(agentIdentity.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * The workspace's stored connection, read through the tenant handle.
 *
 * The integrations catalogue reads through the shared connection, which stops
 * working the moment row-level security is enforced. This reads the same row on
 * the tenant's own transaction, so the worker can resolve a credential without
 * leaving its workspace.
 */
export async function getWorkspaceConnection(
  organizationId: string,
  providerId: string
): Promise<{ encryptedTokens: string } | null> {
  const rows = (await db.execute(sql`
    select encrypted_tokens from integration_connection
    where workspace_id = ${organizationId}
      and provider = ${providerId}
      and revoked_at is null
    limit 1
  `)) as unknown as Array<{ encrypted_tokens?: string }>;
  const row = rows[0];
  if (!row?.encrypted_tokens) return null;
  return { encryptedTokens: row.encrypted_tokens };
}

/* ------------------------------------------------------------------ */
/* Execution attempts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Opens an attempt before any tool runs.
 *
 * The partial unique index on (taskId) where status = 'running' is what makes
 * duplicate execution impossible: a second worker's insert fails with 23505 and
 * this returns `duplicate_execution` instead of pretending nothing happened.
 */
export async function startExecution(input: {
  organizationId: string;
  taskId: string;
  agentId: string;
  tool: string;
  attempt: number;
  leaseExpiresAt?: Date | null;
  idempotencyKey?: string | null;
}) {
  // Check first: once a statement fails inside the tenant transaction the whole
  // transaction is aborted, so a failed insert cannot be recovered from quietly.
  // The partial unique index stays as the backstop for a genuine race.
  const [running] = await db
    .select({ id: agentExecution.id })
    .from(agentExecution)
    .where(
      and(
        eq(agentExecution.organizationId, input.organizationId),
        eq(agentExecution.taskId, input.taskId),
        eq(agentExecution.status, "running")
      )
    )
    .limit(1);
  if (running) {
    return { ok: false as const, error: "duplicate_execution" as const };
  }

  try {
    const [row] = await db
      .insert(agentExecution)
      .values({
        organizationId: input.organizationId,
        taskId: input.taskId,
        agentId: input.agentId,
        tool: input.tool,
        attempt: input.attempt,
        status: "running",
        leaseExpiresAt: input.leaseExpiresAt ?? null,
        heartbeatAt: new Date(),
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();
    return { ok: true as const, execution: row };
  } catch (error) {
    // Drizzle wraps driver errors, so the SQLSTATE may sit on the cause.
    const shaped = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; cause?: { code?: string } };
    };
    const code = shaped.code ?? shaped.cause?.code ?? shaped.cause?.cause?.code;
    const message = shaped.message ?? "";
    if (code === "23505" || /duplicate key value/i.test(message)) {
      return { ok: false as const, error: "duplicate_execution" as const };
    }
    throw error;
  }
}

/** Closes an attempt. Runs once per attempt; later calls change nothing. */
export async function finishExecution(input: {
  organizationId: string;
  executionId: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "rejected";
  durationMs: number;
  resultSummary?: string | null;
  evidenceRef?: string | null;
  error?: string | null;
}) {
  const [row] = await db
    .update(agentExecution)
    .set({
      status: input.status,
      finishedAt: new Date(),
      durationMs: input.durationMs,
      resultSummary: input.resultSummary?.slice(0, 8000) ?? null,
      evidenceRef: input.evidenceRef?.slice(0, 512) ?? null,
      error: input.error?.slice(0, 2000) ?? null,
      // A closed attempt holds no lease: nothing may think it is still alive.
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(agentExecution.id, input.executionId),
        eq(agentExecution.organizationId, input.organizationId),
        eq(agentExecution.status, "running"),
        // The closer must still own the attempt. A worker whose lease expired has
        // been declared dead by recovery, and its late answer must not overwrite the
        // outcome that recovery already recorded.
        or(isNull(agentExecution.leaseExpiresAt), gt(agentExecution.leaseExpiresAt, new Date()))
      )
    )
    .returning();
  return row ?? null;
}

export async function countExecutions(organizationId: string, taskId: string) {
  const rows = await db
    .select({ id: agentExecution.id })
    .from(agentExecution)
    .where(
      and(
        eq(agentExecution.organizationId, organizationId),
        eq(agentExecution.taskId, taskId)
      )
    );
  return rows.length;
}

export async function latestExecution(organizationId: string, taskId: string) {
  const [row] = await db
    .select()
    .from(agentExecution)
    .where(
      and(
        eq(agentExecution.organizationId, organizationId),
        eq(agentExecution.taskId, taskId)
      )
    )
    .orderBy(desc(agentExecution.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getTask(input: { organizationId: string; taskId: string }) {
  const [row] = await db
    .select()
    .from(agentTask)
    .where(and(eq(agentTask.id, input.taskId), eq(agentTask.organizationId, input.organizationId)))
    .limit(1);
  return row ?? null;
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
export async function latestApprovalStatus(taskId: string, organizationId: string) {
  return approvalState(taskId, organizationId);
}

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
/** Thrown when a decision is refused before any row is touched. */
export class ApprovalDecisionError extends Error {
  constructor(readonly code: "reason_required" | "reason_too_short" | "reason_too_long") {
    super(code);
    this.name = "ApprovalDecisionError";
  }
}

export const MIN_REJECTION_REASON = 4;
export const MAX_REJECTION_REASON = 1000;

/**
 * Deciding an approval.
 *
 * The reason rule lives here rather than in the route, because a route is only
 * one of the callers: a job, a script, or tomorrow's endpoint would otherwise
 * bypass it. The route keeps its own copy as a second layer, so a malformed
 * request is refused before this function is even reached.
 *
 * A rejection refuses somebody's work and has to be explainable afterwards, so it
 * must carry a reason. An approval may carry one, and does not need it.
 */
export async function decideApproval(input: {
  organizationId: string;
  approvalId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  reason?: string;
}) {
  const reason = (input.reason ?? "").trim();

  if (input.decision === "rejected") {
    if (reason.length === 0) throw new ApprovalDecisionError("reason_required");
    if (reason.length < MIN_REJECTION_REASON) throw new ApprovalDecisionError("reason_too_short");
  }
  if (reason.length > MAX_REJECTION_REASON) throw new ApprovalDecisionError("reason_too_long");

  // The transition and its audit row are one unit of work. If the insert fails,
  // the approval stays pending; if the transition loses a race, no audit row is
  // written for the loser. Either way the two can never disagree.
  return db.transaction(async (tx) => {
    const [row] = await tx
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

    // No row means "already decided", "not this tenant" or "does not exist".
    // All three are silent: a losing attempt leaves no trace to duplicate.
    if (!row) return null;

    await tx.insert(agentDecision).values({
      organizationId: input.organizationId,
      agentId: null,
      title: `Approval ${input.decision}: ${row.reason}`.slice(0, 200),
      body: reason.length > 0 ? reason : "(no reason given for approval)",
      state: input.decision === "approved" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
      taskId: row.taskId,
      // Unique index in migration 0033 makes a second record impossible even if
      // two transactions were somehow to reach this line.
      approvalId: row.id,
    });

    return row;
  });
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

  if (row) {
    // History, not decoration: the reason and the actor are stored where the
    // interface reads them, so a cancelled task explains itself later.
    await recordDecision(null, {
      organizationId: input.organizationId,
      title: `Cancelled: ${row.title}`.slice(0, 200),
      body: input.reason,
      state: "CANCELLED",
      taskId: row.id,
    });
  }

  return row ?? null;
}

/**
 * Puts a failed or cancelled task back in the queue, and records why.
 *
 * A retry is a real state transition with conditions, never a status edit:
 *   - only failed or cancelled work is retryable, so a completed task cannot be
 *     quietly re-run and lose its evidence;
 *   - a task whose approval was rejected is refused, because retrying must not
 *     become the way to execute something a human said no to;
 *   - the previous owner and evidence are cleared, so the next claimer starts
 *     from the task rather than from somebody else's failure.
 */
export async function retryTask(input: {
  organizationId: string;
  taskId: string;
  by: string;
  reason: string;
}): Promise<
  | { ok: true; task: typeof agentTask.$inferSelect }
  | { ok: false; error: "task_not_found" | "not_retryable" | "approval_rejected" }
> {
  const [target] = await db
    .select({
      status: agentTask.status,
      title: agentTask.title,
      approvalRequired: agentTask.approvalRequired,
    })
    .from(agentTask)
    .where(
      and(
        eq(agentTask.id, input.taskId),
        eq(agentTask.organizationId, input.organizationId)
      )
    )
    .limit(1);

  if (!target) {
    return { ok: false, error: "task_not_found" };
  }
  if (target.status !== "failed" && target.status !== "cancelled") {
    return { ok: false, error: "not_retryable" };
  }
  if (target.approvalRequired) {
    const state = await approvalState(input.taskId, input.organizationId);
    if (state === "rejected") {
      return { ok: false, error: "approval_rejected" };
    }
  }

  // Conditional on the status that was read, so a retry racing a late report or a
  // second retry cannot both win.
  const [row] = await db
    .update(agentTask)
    .set({
      status: "pending",
      ownerAgentId: null,
      claimedAt: null,
      reportedAt: null,
      evidence: null,
    })
    .where(
      and(
        eq(agentTask.id, input.taskId),
        eq(agentTask.organizationId, input.organizationId),
        inArray(agentTask.status, ["failed", "cancelled"])
      )
    )
    .returning();

  if (!row) {
    return { ok: false, error: "not_retryable" };
  }

  await recordDecision(null, {
    organizationId: input.organizationId,
    title: `Retry: ${row.title}`.slice(0, 200),
    body: `Was ${target.status}. ${input.reason} (by ${input.by})`,
    state: "RETRY",
    taskId: row.id,
  });

  return { ok: true, task: row };
}

/** Decisions attached to one task: retries, cancellations, the audit trail. */
export async function listTaskHistory(
  organizationId: string,
  taskId: string,
  limit = 50
) {
  return db
    .select()
    .from(agentDecision)
    .where(
      and(
        eq(agentDecision.organizationId, organizationId),
        eq(agentDecision.taskId, taskId)
      )
    )
    .orderBy(desc(agentDecision.createdAt))
    .limit(Math.min(limit, 100));
}

/**
 * One page of execution history, newest first.
 *
 * Ordered by (createdAt DESC, id DESC) so the order is total even when timestamps
 * collide, and filtered by keyset so a page never repeats or skips a row. The
 * organisation is a mandatory argument, not an option: there is no way to ask for
 * a page without saying whose page it is.
 *
 * The boundary comparison is written as plain column versus bound parameter, so
 * `AgentTask_organizationId_createdAt_idx` can serve both the filter and the
 * order. An earlier version wrapped the column in date_trunc to align a
 * millisecond cursor with microsecond rows; that worked but forced a sequential
 * scan. The cursor now carries the row's exact timestamp text instead, which is
 * exact and index-friendly at the same time.
 */
export async function listTaskPage(options: {
  organizationId: string;
  status?: string;
  limit?: number;
  cursor?: Cursor | null;
}): Promise<{ tasks: (typeof agentTask.$inferSelect)[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const cursor = options.cursor ?? null;

  const conditions = [eq(agentTask.organizationId, options.organizationId)];
  if (options.status) {
    conditions.push(eq(agentTask.status, options.status));
  }
  if (cursor) {
    const boundary = sql`${cursor.stamp}::timestamp`;
    conditions.push(
      or(lt(agentTask.createdAt, boundary), and(eq(agentTask.createdAt, boundary), lt(agentTask.id, cursor.id)))!
    );
  }

  // One extra row answers "is there a next page" without a second query.
  const rows = await db
    .select()
    .from(agentTask)
    .where(and(...conditions))
    .orderBy(desc(agentTask.createdAt), desc(agentTask.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page.at(-1);
  if (!hasMore || !last) {
    return { tasks: page, nextCursor: null };
  }

  // The last row's timestamp as the database renders it, microseconds included.
  // Read by primary key, so it costs one index lookup and cannot drift from the
  // page that was just returned.
  const [exact] = await db
    .select({ stamp: sql<string>`to_char(${agentTask.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')` })
    .from(agentTask)
    .where(eq(agentTask.id, last.id))
    .limit(1);

  return {
    tasks: page,
    nextCursor: encodeCursor(exact?.stamp ?? last.createdAt, last.id),
  };
}

/** The tenant-scoped handle, for Commander modules outside this file. */
export const commanderDb = db;
