import { withPlatformClient } from "@/lib/db/platform-client";
import { agentIdentityForTask } from "@/lib/agents/command-center";
import { withCommanderScope } from "@/lib/agents/commander-scope";
import { materialiseDueSchedules } from "./schedule";
import { toolPayloadFor } from "./tool-payload";
import { reclaimExpiredLeases } from "@/lib/agents/worker-lease";
import { runTask, WORKER_TOOLS } from "@/lib/agents/worker";

/**
 * The scheduler: chooses what runs next, then hands each task to its own
 * workspace's transaction.
 *
 * There is no persistent process on this platform, so scheduling is an HTTP call
 * that does a bounded amount of work and returns. Overlap is prevented by a
 * session-scoped advisory lock taken on a dedicated connection, not by a flag:
 * two invocations arriving together cannot both hold it.
 */

const LOCK_KEY = 8135713;

export type SchedulerConfig = {
  perOrganizationLimit: number;
  globalLimit: number;
  batchSize: number;
  /** The fallback tool, used only for a task that names none of its own. */
  tool: string;
  /**
   * One workspace's queue, run on the owner's request.
   *
   * The platform pass selects across tenants; this one never leaves the workspace that asked,
   * so an owner pressing "run" cannot execute another tenant's work.
   */
  organizationId?: string;
  /** Injected in tests so a scheduling pass never reaches the network. */
  fetchImpl?: typeof fetch;
};

export type SchedulerResult = {
  ran: boolean;
  reason?: string;
  schedulerRunId?: string;
  reclaimed: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  outcomes: Array<{ taskId: string; organizationId: string; status: string; tool?: string; error?: string }>;
};

export function schedulerConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    perOrganizationLimit: Number(process.env.SCHEDULER_PER_ORG_LIMIT ?? 1),
    globalLimit: Number(process.env.SCHEDULER_GLOBAL_LIMIT ?? 2),
    batchSize: Number(process.env.SCHEDULER_BATCH_SIZE ?? 2),
    tool: process.env.SCHEDULER_TOOL ?? "github_repo_inspect",
    ...overrides,
  };
}

type Candidate = {
  id: string;
  organizationId: string;
  createdAt: Date;
  payload: Record<string, unknown> | null;
  title?: string | null;
  instruction?: string | null;
  ownerAgentId?: string | null;
};

/**
 * The tool a task asks for.
 *
 * A task carries the tool the action declared (`payload.tool`). The pass used to run every task
 * with one configured tool instead, so a readiness report executed the repository inspector:
 * the task said one thing and the worker did another. A task naming a tool the worker does not
 * implement falls back rather than silently running the wrong one.
 */
export function toolForTask(task: Candidate, config: SchedulerConfig) {
  const declared = task.payload && typeof task.payload.tool === "string" ? task.payload.tool : null;
  if (declared && WORKER_TOOLS[declared]) return declared;
  // A task written by a person names its tool in words, not in a payload (the task form sends
  // none). Defaulting to the repository inspector made a readiness check fail on a GitHub token
  // it never needed. The first tool the text names, in the order it appears, wins; a task that
  // names none keeps the configured fallback.
  const text = `${task.title ?? ""}\n${task.instruction ?? ""}`;
  let best: { name: string; at: number } | null = null;
  for (const name of Object.keys(WORKER_TOOLS)) {
    const at = text.indexOf(name);
    if (at >= 0 && (best === null || at < best.at)) best = { name, at };
  }
  return best ? best.name : config.tool;
}

/** Trims to a maximum length without cutting a surrogate pair in half. */
function clip(value: string, max: number): string {
  const chars = Array.from(value.trim().replace(/\s+/g, " "));
  return chars.length > max ? chars.slice(0, max).join("").trim() : chars.join("");
}

/**
 * Arguments for a tool chosen from the task's own words.
 *
 * A task created from the form carries only a title and an instruction. When its tool is
 * inferred from that text, the tool still needs its arguments: the readiness report
 * refused every such task with invalid_label (seen in production on 2026-11-21, task
 * ec235d80). The title is the label the person already wrote; nothing is invented. An
 * explicit payload value always wins over these.
 */
export function argumentsFromText(tool: string, task: Candidate): Record<string, unknown> {
  if (tool === "load_skill") {
    const text = `${task.title ?? ""}\n${task.instruction ?? ""}`;
    const matches = [...text.matchAll(/\bload_skill[ \t]+([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-zA-Z0-9_-])/g)];
    if (matches.length === 1 && matches[0][1].length <= 64) return { name: matches[0][1] };
    return {};
  }
  const title = clip(task.title ?? "", 120);
  const instruction = clip(task.instruction ?? "", 2000);
  if (tool === "workspace_readiness_inspect" && title.length >= 3) {
    return { label: clip(title, 60) };
  }
  if (tool === "project_document_create") {
    const args: Record<string, unknown> = {};
    if (title.length >= 3) args.title = title;
    if (instruction.length >= 20) args.brief = instruction;
    return args;
  }
  return {};
}

/**
 * Fair selection: one task per workspace per pass, oldest first, so a workspace
 * with a thousand queued tasks cannot starve a workspace with one.
 */
function selectFairly(
  candidates: Candidate[],
  runningByOrg: Map<string, number>,
  config: SchedulerConfig,
  capacity: number
): Candidate[] {
  const chosen: Candidate[] = [];
  const takenByOrg = new Map<string, number>();
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (chosen.length >= Math.min(config.batchSize, capacity)) break;
    if (seen.has(candidate.organizationId)) continue;
    const already = (runningByOrg.get(candidate.organizationId) ?? 0) + (takenByOrg.get(candidate.organizationId) ?? 0);
    if (already >= config.perOrganizationLimit) continue;
    const firstForOrg = candidates.find((c) => c.organizationId === candidate.organizationId && !seen.has(c.organizationId));
    const pick = firstForOrg ?? candidate;
    seen.add(pick.organizationId);
    takenByOrg.set(pick.organizationId, (takenByOrg.get(pick.organizationId) ?? 0) + 1);
    chosen.push(pick);
  }
  return chosen;
}

export async function runScheduler(overrides: Partial<SchedulerConfig> = {}): Promise<SchedulerResult> {
  const config = schedulerConfig(overrides);

  return withPlatformClient(async (sql) => {
    const lock = await sql<{ ok: boolean }[]>`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
    if (!lock[0]?.ok) {
      return {
        ran: false,
        reason: "overlapping_run",
        reclaimed: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        outcomes: [],
      };
    }

    const runId = (
      await sql<{ id: string }[]>`insert into "SchedulerRun" (status) values ('running') returning id`
    )[0].id;

    try {
      // 1. Repair first: a task whose worker died must not block its workspace.
      const expired = await sql<
        { id: string; taskId: string; organizationId: string }[]
      >`select id, "taskId", "organizationId" from "AgentExecution"
        where status = 'running' and "leaseExpiresAt" is not null and "leaseExpiresAt" < now()
        limit 50`;
      // Recurring schedules become tasks before anything is dispatched, inside this pass and
    // under the same advisory lock. A second scheduler cannot duplicate a slot: the work is
    // an INSERT that relies on the unique ("scheduleId", "scheduledFor") index, not on this
    // lock being the only writer.
    let materialised = { created: 0, advanced: 0, skipped: 0 };
    try {
      materialised = await materialiseDueSchedules({});
    } catch (error) {
      // A schedule that cannot be materialised must not stop execution of the tasks that
      // already exist; it is reported in the run row instead.
      console.error(JSON.stringify({
        event: "schedule_materialisation_failed",
        error: error instanceof Error ? error.message : String(error),
      }));
    }

    const repaired = await reclaimExpiredLeases(
        withCommanderScope,
        expired.map((row) => ({ executionId: row.id, taskId: row.taskId, organizationId: row.organizationId }))
      );

      // 2. Capacity, from what is actually running.
      const running = await sql<{ organizationId: string; n: number }[]>`
        select "organizationId", count(*)::int as n from "AgentExecution"
        where status = 'running' group by 1`;
      const runningByOrg = new Map(running.map((row) => [row.organizationId, Number(row.n)]));
      const totalRunning = running.reduce((sum, row) => sum + Number(row.n), 0);
      const capacity = Math.max(0, config.globalLimit - totalRunning);

      if (capacity === 0) {
        await sql`update "SchedulerRun" set status='idle', "finishedAt"=now(),
                  "reclaimedCount"=${repaired.length},
                  detail=${sql.json({ reason: "global_limit_reached", totalRunning })}
                  where id = ${runId}`;
        return {
          ran: true,
          reason: "global_limit_reached",
          schedulerRunId: runId,
          reclaimed: repaired.length,
          attempted: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          outcomes: [],
        };
      }

      // 3. Candidates, oldest first, then fair selection.
      const candidateLimit = Math.max(20, config.batchSize * 20);
      const candidates = config.organizationId
        ? await sql<Candidate[]>`
            select id, "organizationId", "createdAt", payload, title, instruction, "ownerAgentId" from "AgentTask"
            where status = 'pending' and "organizationId" = ${config.organizationId}
            order by "createdAt" asc limit ${candidateLimit}`
        : await sql<Candidate[]>`
            select id, "organizationId", "createdAt", payload, title, instruction, "ownerAgentId" from "AgentTask"
            where status = 'pending' order by "createdAt" asc limit ${candidateLimit}`;
      const chosen = selectFairly(candidates, runningByOrg, config, capacity);

      // 4. Each task runs inside its own workspace's transaction.
      const outcomes: SchedulerResult["outcomes"] = [];
      for (const task of chosen) {
        const agent = await withCommanderScope(task.organizationId, () =>
          agentIdentityForTask(task.organizationId, task.ownerAgentId ?? null)
        );
        if (!agent) {
          outcomes.push({
            taskId: task.id,
            organizationId: task.organizationId,
            status: "rejected",
            // An assigned agent that is gone or disabled is not silently replaced by another one.
            error: task.ownerAgentId ? "owner_agent_unavailable" : "no_agent_identity",
          });
          continue;
        }
        const tool = toolForTask(task, config);
        if (tool === "github_repo_inspect" && task.payload?.secretName !== undefined) {
          outcomes.push({
            taskId: task.id,
            organizationId: task.organizationId,
            status: "rejected",
            tool,
            error: "named_secret_not_supported",
          });
          continue;
        }
        const outcome = await withCommanderScope(task.organizationId, () =>
          runTask(agent as never, {
            taskId: task.id,
            tool,
            fetchImpl: config.fetchImpl,
            payload: task.payload?.tool === "github_repo_probe"
              ? task.payload
              : toolPayloadFor(tool, { ...argumentsFromText(tool, task), ...(task.payload ?? {}) }),
          })
        );
        outcomes.push({
          taskId: outcome.taskId,
          organizationId: task.organizationId,
          status: outcome.status,
          tool,
          error: outcome.error,
        });
      }

      const succeeded = outcomes.filter((o) => o.status === "completed").length;
      const failed = outcomes.filter((o) => o.status === "failed" || o.status === "timed_out").length;
      const skipped = chosen.length - succeeded - failed;

      await sql`update "SchedulerRun" set status='finished', "finishedAt"=now(),
                "claimedCount"=${chosen.length}, "succeededCount"=${succeeded},
                "failedCount"=${failed}, "skippedCount"=${skipped},
                "reclaimedCount"=${repaired.length},
                detail=${sql.json({ config, outcomes, repaired })}
                where id = ${runId}`;

      return {
        ran: true,
        schedulerRunId: runId,
        reclaimed: repaired.length,
        attempted: chosen.length,
        succeeded,
        failed,
        skipped,
        outcomes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`update "SchedulerRun" set status='failed', "finishedAt"=now(), error=${message.slice(0, 2000)}
                where id = ${runId}`.catch(() => {});
      throw error;
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    }
  });
}
