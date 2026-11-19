import { eq, sql } from "drizzle-orm";

import { commanderActiveDb } from "@/lib/db/tenant-context";
import * as queriesModule from "@/lib/db/queries";
import { agentExecution, agentIdentity, agentProject, agentSchedule, agentTask } from "@/lib/db/schema";
import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";

/**
 * Reads this workspace's own records and reports what needs attention.
 *
 * The first action a customer can run with no external account, no token and no purchase. It
 * exists because "the platform can run work" must be provable without borrowing a credential:
 * everything below is read from the workspace's own tables through the same connection the rest
 * of the commander uses, so the result is a real measurement of real rows.
 *
 * Read-only in the strict sense: five SELECTs, scoped by organizationId, and no write of any
 * kind. It also never leaves the database, so it cannot leak a tenant's data to a third party.
 */

const count = sql<number>`count(*)`.mapWith(Number);

/**
 * The same lazy handle the Commander uses: inside a tenant transaction these reads are subject
 * to that tenant's policies, and outside one they fall back to the shared connection. Lazy so
 * the shared connection is touched only when a report is actually requested.
 */
const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
});

export const workspaceReadinessInspect: WorkerTool = {
  name: "workspace_readiness_inspect",
  readOnly: true,
  timeoutMs: 10_000,
  maxAttempts: 1,
  description:
    "Reads this workspace's agents, projects, tasks, schedules and executions and reports what needs attention. Internal and read-only: it calls no external service.",
  async run({ organizationId, payload, signal }) {
    const label = typeof payload.label === "string" ? payload.label.trim() : "";
    // A label is the one thing the customer supplies. It names the report, and rejecting a bad
    // one here is the honest version of validating input rather than accepting anything.
    if (label.length < 3 || label.length > 60) {
      return {
        ok: false,
        summary: "The report label must be between 3 and 60 characters.",
        error: "invalid_label",
      };
    }
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before it started.", error: "aborted" };
    }

    const scope = eq(agentIdentity.organizationId, organizationId);

    const [agents] = await db
      .select({ total: count, active: sql<number>`count(*) filter (where ${agentIdentity.status} = 'active')`.mapWith(Number) })
      .from(agentIdentity)
      .where(scope);

    const [projects] = await db
      .select({ total: count, archived: sql<number>`count(*) filter (where ${agentProject.status} = 'archived')`.mapWith(Number) })
      .from(agentProject)
      .where(eq(agentProject.organizationId, organizationId));

    const taskRows = await db
      .select({ status: agentTask.status, total: count })
      .from(agentTask)
      .where(eq(agentTask.organizationId, organizationId))
      .groupBy(agentTask.status);

    const executionRows = await db
      .select({ status: agentExecution.status, total: count })
      .from(agentExecution)
      .where(eq(agentExecution.organizationId, organizationId))
      .groupBy(agentExecution.status);

    const [schedules] = await db
      .select({ total: count, active: sql<number>`count(*) filter (where ${agentSchedule.enabled} = true)`.mapWith(Number) })
      .from(agentSchedule)
      .where(eq(agentSchedule.organizationId, organizationId));

    const tasks = Object.fromEntries(taskRows.map((row) => [row.status, row.total]));
    const executions = Object.fromEntries(executionRows.map((row) => [row.status, row.total]));
    const taskTotal = taskRows.reduce((sum, row) => sum + row.total, 0);
    const executionTotal = executionRows.reduce((sum, row) => sum + row.total, 0);
    const pending = tasks.pending ?? 0;
    const failed = executions.failed ?? 0;

    // What needs a human, in plain language, in the same order a person would ask.
    const attention: string[] = [];
    if (agents.total === 0) attention.push("no agent exists yet, so nothing can be assigned work");
    else if (agents.active === 0) attention.push("every agent is disabled, so queued work will not run");
    if (pending > 0) attention.push(`${pending} task(s) are waiting for a worker`);
    if (failed > 0) attention.push(`${failed} execution(s) ended in an error`);

    const summary = redact(
      `${label} — ` +
      [
        `${agents.total} agent(s) (${agents.active} active)`,
        `${projects.total} project(s)`,
        `${taskTotal} task(s) (${pending} pending)`,
        `${executionTotal} execution(s) (${executions.succeeded ?? 0} succeeded, ${failed} failed)`,
        `${schedules.total} schedule(s) (${schedules.active} active)`,
        attention.length ? `Needs attention: ${attention.join("; ")}.` : "Nothing needs attention.",
      ].join(" · ")
    );

    return {
      ok: true,
      summary,
      evidence: {
        label,
        agents,
        projects,
        tasks,
        executions,
        schedules,
        attention,
        measuredAt: new Date().toISOString(),
        source: "workspace database",
      },
    };
  },
};
