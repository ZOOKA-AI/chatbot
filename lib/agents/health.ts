import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import * as queriesModule from "@/lib/db/queries";
import { commanderActiveDb } from "@/lib/db/tenant-context";
import { agentExecution, agentTask, schedulerRun } from "@/lib/db/schema";
import { adminDb } from "@/lib/db/queries";

/**
 * Execution health, read from the database rather than reported by the worker.
 *
 * The worker cannot be trusted to announce that it is unwell: a process that has
 * died sends nothing, which is exactly the failure that matters most. So every
 * signal here is derived from rows somebody else wrote, and a missing row is
 * itself a signal. Nothing in this module sends an alert by itself; it only
 * states, in one verdict, what the evidence supports.
 */

export type SignalStatus = "ok" | "warn" | "critical" | "unknown";

export type HealthSignal = {
  name: string;
  status: SignalStatus;
  detail: string;
};

export type ExecutionHealth = {
  verdict: SignalStatus;
  generatedAt: string;
  signals: HealthSignal[];
  counts: {
    pending: number;
    running: number;
    failedLastHour: number;
    stuckLeases: number;
    approvalsWaiting: number;
  };
};

const MINUTE = 60_000;
const PENDING_WARN_MS = 30 * MINUTE;
const PENDING_CRITICAL_MS = 2 * 60 * MINUTE;
const SCHEDULER_STALE_MS = 90 * MINUTE;
const FAILURE_BURST = 5;

/**
 * Resolved per call, exactly like the command center: inside a tenant transaction
 * this is that transaction, and outside one it is the shared connection. Reading
 * lazily matters for the same reason there, and binding to the source matters
 * more: a transaction method called through the proxy loses its session.
 */
const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
}) as typeof queriesModule.db;

const rank: Record<SignalStatus, number> = { unknown: 0, ok: 1, warn: 2, critical: 3 };

function worst(signals: HealthSignal[]): SignalStatus {
  return signals.reduce<SignalStatus>(
    (acc, signal) => (rank[signal.status] > rank[acc] ? signal.status : acc),
    "ok"
  );
}

function minutes(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)}m`;
  return `${Math.round(ms / (60 * MINUTE))}h`;
}

/**
 * @param organizationId the workspace whose work is being judged. Reads are
 *   confined to it by the caller's tenant scope, so a health check in one
 *   workspace can never see, or be confused by, another's queue.
 */
export async function workspaceExecutionHealth(organizationId: string): Promise<ExecutionHealth> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * MINUTE);
  const signals: HealthSignal[] = [];

  const [queue] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${agentTask.status} = 'pending')::int`,
      running: sql<number>`count(*) filter (where ${agentTask.status} = 'running')::int`,
      oldestPending: sql<Date | null>`min(${agentTask.createdAt}) filter (where ${agentTask.status} = 'pending')`,
      approvals: sql<number>`count(*) filter (where ${agentTask.status} = 'awaiting_approval')::int`,
    })
    .from(agentTask)
    .where(eq(agentTask.organizationId, organizationId));

  const pending = queue?.pending ?? 0;
  const running = queue?.running ?? 0;
  const approvalsWaiting = queue?.approvals ?? 0;

  if (pending === 0) {
    signals.push({ name: "queue", status: "ok", detail: "nothing is waiting" });
  } else if (!queue?.oldestPending) {
    signals.push({ name: "queue", status: "warn", detail: `${pending} waiting, age unknown` });
  } else {
    const age = now.getTime() - new Date(queue.oldestPending).getTime();
    const status: SignalStatus =
      age >= PENDING_CRITICAL_MS ? "critical" : age >= PENDING_WARN_MS ? "warn" : "ok";
    signals.push({
      name: "queue",
      status,
      detail: `${pending} waiting, oldest ${minutes(age)}`,
    });
  }

  const [leases] = await db
    .select({
      stuck: sql<number>`count(*)::int`,
    })
    .from(agentExecution)
    .where(
      and(
        eq(agentExecution.organizationId, organizationId),
        eq(agentExecution.status, "running"),
        lt(agentExecution.leaseExpiresAt, now)
      )
    );
  const stuckLeases = leases?.stuck ?? 0;
  signals.push(
    stuckLeases === 0
      ? { name: "leases", status: "ok", detail: "no execution is holding an expired lease" }
      : {
          name: "leases",
          // A lease past its expiry means the worker stopped heartbeating. Until
          // recovery runs, the task is neither finished nor available.
          status: "critical",
          detail: `${stuckLeases} execution(s) expired without a heartbeat`,
        }
  );

  const [failures] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(agentExecution)
    .where(and(eq(agentExecution.organizationId, organizationId), eq(agentExecution.status, "failed"), gte(agentExecution.startedAt, hourAgo)));
  const failedLastHour = failures?.failed ?? 0;
  signals.push(
    failedLastHour === 0
      ? { name: "failures", status: "ok", detail: "no failed execution in the last hour" }
      : {
          name: "failures",
          status: failedLastHour >= FAILURE_BURST ? "critical" : "warn",
          detail: `${failedLastHour} failed in the last hour`,
        }
  );

  // SchedulerRun is global telemetry owned by the system, not by a tenant, so it
  // is read on the bootstrap connection (0052 revokes runtime access to it).
  const [scheduler] = await adminDb()
    .select({ startedAt: schedulerRun.startedAt, status: schedulerRun.status, error: schedulerRun.error })
    .from(schedulerRun)
    .orderBy(sql`${schedulerRun.startedAt} desc`)
    .limit(1);

  if (!scheduler) {
    // Honest and important: no scheduler pass has ever been recorded, so the
    // queue cannot drain no matter how healthy everything else looks.
    signals.push({
      name: "scheduler",
      status: "warn",
      detail: "no scheduler pass has been recorded, so nothing can be dispatched",
    });
  } else {
    const age = now.getTime() - new Date(scheduler.startedAt).getTime();
    const stale = age >= SCHEDULER_STALE_MS;
    signals.push({
      name: "scheduler",
      status: stale || scheduler.status === "failed" ? "critical" : "ok",
      detail:
        scheduler.status === "failed"
          ? `last pass failed ${minutes(age)} ago: ${(scheduler.error ?? "").slice(0, 80)}`
          : `last pass ${minutes(age)} ago (${scheduler.status})`,
    });
  }

  if (approvalsWaiting > 0) {
    signals.push({
      name: "approvals",
      status: "warn",
      detail: `${approvalsWaiting} task(s) are waiting for a human decision`,
    });
  }

  return {
    verdict: worst(signals),
    generatedAt: now.toISOString(),
    signals,
    counts: { pending, running, failedLastHour, stuckLeases, approvalsWaiting },
  };
}
