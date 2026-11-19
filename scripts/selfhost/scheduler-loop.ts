/**
 * The scheduler process.
 *
 * One leader at a time: `runScheduler` takes a PostgreSQL advisory lock, so running three
 * of these is safe and only one dispatches per tick. Lease repair happens first inside
 * that function, which is why a crashed worker does not wedge its workspace.
 *
 * A plain process: no HTTP trigger, no platform cron, no paid scheduler service.
 */

import { schedulerConfig } from "../../lib/platform/config";

const config = schedulerConfig();
const log = (event: string, detail: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), service: "scheduler", event, ...detail }));

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
  log("shutdown_requested");
});
process.on("SIGINT", () => {
  stopping = true;
});

async function main() {
  log("scheduler_started", { intervalMs: config.scheduler.intervalMs, batchSize: config.scheduler.batchSize });

  while (!stopping) {
    const started = Date.now();
    try {
      const { runScheduler } = await import("../../lib/agents/scheduler");
      const result = await runScheduler({
        batchSize: config.scheduler.batchSize,
        globalLimit: config.scheduler.globalLimit,
        // The core calls this perOrganizationLimit; "workspace" is the product's word
        // for the same thing, and the operator sets it to their capacity.
        perOrganizationLimit: config.scheduler.perWorkspaceLimit,
        tool: process.env.SCHEDULER_TOOL || undefined,
      });
      // Logged as one line per pass so `docker compose logs` doubles as an audit trail.
      log("pass", {
        ran: result.ran,
        reason: result.reason,
        reclaimed: result.reclaimed,
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    } catch (error) {
      log("pass_failed", { error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(500, config.scheduler.intervalMs - (Date.now() - started))));
  }
  log("scheduler_stopped");
}

void main();
