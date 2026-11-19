import { and, eq, lt, sql } from "drizzle-orm";

import { commanderDb as db } from "@/lib/agents/command-center";
import { agentExecution, agentTask } from "@/lib/db/schema";

/**
 * How long an attempt may hold a task without proving it is alive.
 *
 * A worker on a serverless platform can be frozen mid-request. Without a lease,
 * that task stays "in progress" for ever and the queue silently stops for that
 * workspace. The sweep below is the only thing that repairs it.
 */
export const LEASE_MS = 90_000;
export const HEARTBEAT_MS = 30_000;

export function leaseDeadline(from: Date = new Date()) {
  return new Date(from.getTime() + LEASE_MS);
}

/** Refreshes the heartbeat, and refuses to extend an attempt that is already gone. */
export async function heartbeat(executionId: string, organizationId: string) {
  const [row] = await db
    .update(agentExecution)
    .set({ heartbeatAt: new Date(), leaseExpiresAt: leaseDeadline() })
    .where(
      and(
        eq(agentExecution.id, executionId),
        eq(agentExecution.organizationId, organizationId),
        eq(agentExecution.status, "running")
      )
    )
    .returning({ id: agentExecution.id });
  return row ?? null;
}

/**
 * Finds attempts whose lease ran out and closes them, inside each workspace's own
 * transaction. Returns the tasks it repaired.
 *
 * The task is set to `failed`, never to `completed`: nothing verified the work, so
 * there is nothing to be optimistic about. It stays retryable like any failure.
 */
export async function reclaimExpiredLeases(
  runInTenant: <T>(organizationId: string, fn: () => Promise<T>) => Promise<T>,
  expired: Array<{ executionId: string; taskId: string; organizationId: string }>
) {
  const repaired: string[] = [];
  for (const row of expired) {
    await runInTenant(row.organizationId, async () => {
      const [closed] = await db
        .update(agentExecution)
        .set({
          status: "timed_out",
          finishedAt: new Date(),
          error: "lease_expired",
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(agentExecution.id, row.executionId),
            eq(agentExecution.organizationId, row.organizationId),
            eq(agentExecution.status, "running"),
            lt(agentExecution.leaseExpiresAt, new Date())
          )
        )
        .returning({ id: agentExecution.id });
      if (!closed) return;
      await db
        .update(agentTask)
        .set({
          status: "failed",
          evidence: sql`${'Lease expired: the worker never reported back. Closed by recovery at ' + new Date().toISOString()}`,
          reportedAt: new Date(),
        })
        .where(
          and(
            eq(agentTask.id, row.taskId),
            eq(agentTask.organizationId, row.organizationId),
            eq(agentTask.status, "in_progress")
          )
        );
      repaired.push(row.taskId);
    });
  }
  return repaired;
}

export function idempotencyKey(taskId: string, tool: string, attempt: number) {
  return `${taskId}:${tool}:${attempt}`;
}
