/**
 * The worker process.
 *
 * Runs outside Next on purpose: background execution must not depend on an inbound
 * request, and a web container that is idle or scaled to zero must not stop work.
 *
 * Ownership of a task comes from the database, never from memory, because this process is
 * expected to run as several copies at once.
 */

import postgres from "postgres";

import { workerConfig } from "../../lib/platform/config";

type Task = { id: string; organizationId: string; title: string };

const config = workerConfig();
const log = (event: string, detail: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), service: "worker", worker: config.worker.id, event, ...detail }));

const sql = postgres(config.database.url, { max: config.worker.concurrency + 1, onnotice: () => {} });

let stopping = false;
const inFlight = new Set<Promise<void>>();

function installSignalHandlers() {
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("shutdown_requested", { signal, inFlight: inFlight.size });
    const deadline = setTimeout(() => {
      log("shutdown_forced", { inFlight: inFlight.size });
      process.exit(1);
    }, config.worker.shutdownGraceMs);
    deadline.unref();
    void Promise.allSettled([...inFlight]).then(async () => {
      await sql.end({ timeout: 5 }).catch(() => {});
      log("shutdown_complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

/**
 * Candidate selection, deliberately *not* a claim.
 *
 * The claim belongs to `claimTask`, which is one conditional UPDATE
 * (`... where id = ? and status = 'pending'`) — that single statement is what makes two
 * workers racing for the same task safe: exactly one gets the row, the other is told the
 * task is not pending and moves on. Pre-claiming here would set the status first and make
 * the real claim fail for everybody, which is how an earlier version of this file turned
 * every task into a rejected run and left the queue stuck on 'running'.
 */
async function candidates(limit: number): Promise<Task[]> {
  return sql<Task[]>`
    select t.id, t."organizationId", t.title
      from "AgentTask" t
     where t.status = 'pending'
       and not exists (
         select 1 from "AgentExecution" e
         where e."taskId" = t.id and e.status = 'running'
       )
     order by t."createdAt" asc
     limit ${limit}`;
}

async function execute(task: Task) {
  const { runTask } = await import("../../lib/agents/worker");
  const { toolPayloadFor } = await import("../../lib/agents/tool-payload");
  const identity = await sql<{ id: string }[]>`
    select id from "AgentIdentity" where "organizationId" = ${task.organizationId} order by "createdAt" asc limit 1`;
  const agentId = identity[0]?.id;

  if (!agentId) {
    // Refusing beats inventing an identity: an execution with no agent cannot be
    // attributed, and attribution is what the audit trail is for.
    await sql`update "AgentTask" set status='blocked' where id=${task.id}`;
    log("no_agent_identity", { taskId: task.id, organizationId: task.organizationId });
    return;
  }

  const started = Date.now();
  try {
    const outcome = await runTask(
      { id: agentId, organizationId: task.organizationId } as never,
      { taskId: task.id, tool: config.worker.tool, payload: toolPayloadFor(config.worker.tool) } as never
    );

    // A task that stays 'running' with no execution record is the failure this loop must
    // never produce: nothing is working on it, and the scheduler only repairs executions.
    if (!outcome.ok && outcome.executionId === null) {
      const reason = outcome.error ?? outcome.status;
      // "Lost the race" is not a failure of the task: another worker claimed it, which is
      // the normal outcome when several are polling. The observed string is
      // `task_already_claimed`, so this matches by pattern rather than by one guess.
      const lost = /already_claimed|not_pending|task_not_found/.test(reason);
      if (!lost) {
        // tool_not_authorized and friends are configuration errors: park the task where a
        // person will see it rather than leaving it looking busy.
        await sql`update "AgentTask" set status='blocked', evidence=${reason} where id=${task.id}`.catch(() => {});
      }
      log("task_not_run", { taskId: task.id, reason });
      return;
    }

    log("task_finished", {
      taskId: task.id,
      ok: outcome.ok,
      status: outcome.status,
      executionId: outcome.executionId,
      ms: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update "AgentTask" set status='failed', "reportedAt"=now() where id=${task.id}`.catch(() => {});
    log("task_threw", { taskId: task.id, error: message });
  }
}

async function main() {
  installSignalHandlers();
  log("worker_started", { concurrency: config.worker.concurrency, pollMs: config.worker.pollIntervalMs });

  while (!stopping) {
    const started = Date.now();
    try {
      const slots = config.worker.concurrency - inFlight.size;
      if (slots > 0) {
        const batch = await candidates(slots);
        for (const task of batch) {
          if (stopping) break;
          const promise = execute(task).finally(() => inFlight.delete(promise));
          inFlight.add(promise);
        }
      }
    } catch (error) {
      // A database blip must not end the process: the next poll retries, and the
      // scheduler repairs any lease this worker fails to finish.
      log("poll_failed", { error: error instanceof Error ? error.message : String(error) });
    }

    const elapsed = Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, Math.max(250, config.worker.pollIntervalMs - elapsed)));
  }
}

void main();
