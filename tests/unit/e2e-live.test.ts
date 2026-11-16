import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, test, describe, vi } from "vitest";

/**
 * One real chain, end to end, against real services.
 *
 * Opt-in only (E2E_LIVE=1) because it reads a real repository and a real Vercel
 * account. Read-only throughout: nothing is created, deployed or changed outside
 * this development database.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { createTask, getTask, listTasks } from "@/lib/agents/command-center";
import { createCommanderTools } from "@/lib/ai/tools/commander";
import { withCommanderScope } from "@/lib/agents/commander-scope";
import { executionReport } from "@/lib/agents/worker";
import { runScheduler } from "@/lib/agents/scheduler";
import { encryptTokens } from "@/lib/integrations/catalog";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME && process.env.E2E_LIVE === "1");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let admin: ReturnType<typeof postgres>;

describe.skipIf(!ready)("real end-to-end chain", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    process.env.DATABASE_URL_PLATFORM = ADMIN as string;
    process.env.WORKER_GITHUB_ALLOWED_REPOS = "zooka-ai/chatbot";
    process.env.WORKER_ALLOW_SHARED_CREDENTIAL = "0";
    process.env.SCHEDULER_TOOL = "github_repo_inspect";
    process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");

    admin = postgres(ADMIN as string, { max: 2 });
    await admin.unsafe("select pg_advisory_lock(727272)");
    for (const name of [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0040_agent_tools_and_instructions.sql",
      "pending/0034_agent_execution.sql",
      "pending/0035_worker_lease_and_scheduler.sql",
    ]) {
      const body = readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
      for (const part of body.split("--> statement-breakpoint")) {
        const statement = part.trim();
        if (!statement) continue;
        try {
          await admin.unsafe(statement);
        } catch (error) {
          if (!/already exists|does not exist|skipping/i.test((error as Error).message)) throw error;
        }
      }
    }
    await admin`delete from "SchedulerRun"`;
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`delete from integration_connection`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A})`;
    // The workspace's own credentials, exactly as the settings screen stores them.
    await admin`insert into integration_connection (workspace_id, provider, encrypted_tokens)
                values (${ORG_A}, 'github', ${encryptTokens({ accessToken: process.env.LIVE_GITHUB_TOKEN as string })}),
                       (${ORG_A}, 'vercel', ${encryptTokens({ accessToken: process.env.LIVE_VERCEL_TOKEN as string })})`;
  }, 120_000);

  afterAll(async () => {
    await admin?.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end({ timeout: 5 });
  }, 30_000);

  test("task -> scheduler -> worker -> live GitHub -> evidence -> history", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({
        organizationId: ORG_A,
        title: "Inspect the authorised repository",
        instruction: "Read zooka-ai/chatbot metadata and package.json",
        createdBy: "owner",
      })
    );
    console.log("E2E_TASK", task.id, task.status);

    const result = await runScheduler({ batchSize: 1, globalLimit: 2, perOrganizationLimit: 1, tool: "github_repo_inspect" });
    console.log("E2E_SCHEDULER", JSON.stringify(result));

    assert.equal(result.attempted, 1);
    assert.equal(result.outcomes[0].status, "completed", `worker said: ${result.outcomes[0].error}`);

    const stored = await withCommanderScope(ORG_A, () => getTask({ organizationId: ORG_A, taskId: task.id }));
    const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
    console.log("E2E_EVIDENCE", JSON.stringify({ status: stored?.status, report, evidence: stored?.evidence?.slice(0, 300) }));

    assert.equal(stored?.status, "completed");
    assert.equal(report?.status, "succeeded");
    assert.ok(report?.evidenceRef?.startsWith("execution:"));
    assert.match(report?.resultSummary ?? "", /branch main/);

    const [run] = await admin`select status, "claimedCount", "succeededCount" from "SchedulerRun" where id = ${String(result.schedulerRunId)}`;
    assert.equal(run.succeededCount, 1);
  }, 90_000);

  test("a chat command becomes real work and a verified result", async () => {
    // What the model can actually call in a conversation: create, then read.
    const tools = createCommanderTools({ organizationId: ORG_A, userId: "owner-user-1", canManage: true });
    const queued = (await tools.createExecutionTask.execute!(
      {
        title: "Report the authorised repository state",
        instruction: "Read zooka-ai/chatbot metadata and report branch, size and last push",
      },
      { toolCallId: "chat-1", messages: [] } as never
    )) as { ok: boolean; taskId: string; status: string };
    console.log("CHAT_QUEUED", JSON.stringify(queued));
    assert.equal(queued.ok, true);
    assert.equal(queued.status, "pending", "the chat tool may not report work as done");

    // Scheduler claims it, in a bounded pass.
    const pass = await runScheduler({ batchSize: 1, globalLimit: 2, perOrganizationLimit: 1, tool: "github_repo_inspect" });
    console.log("CHAT_SCHEDULER", JSON.stringify({ run: pass.schedulerRunId, outcome: pass.outcomes[0] }));
    assert.equal(pass.outcomes[0]?.status, "completed", `worker said ${pass.outcomes[0]?.error}`);

    // The same tool the model uses to tell the user what happened.
    const status = (await tools.getExecutionStatus.execute!(
      { taskId: queued.taskId },
      { toolCallId: "chat-2", messages: [] } as never
    )) as Record<string, unknown>;
    console.log("CHAT_STATUS", JSON.stringify(status));

    const history = await withCommanderScope(ORG_A, () => listTasks({ organizationId: ORG_A, limit: 20 }));
    const row = history.find((task) => task.id === queued.taskId);
    console.log("CHAT_HISTORY", JSON.stringify({ taskId: row?.id, status: row?.status, evidence: String(row?.evidence).slice(0, 160) }));
    assert.equal(row?.status, "completed");
    assert.match(String(row?.evidence), /branch main/);
  }, 90_000);

  test("the same chain reads the workspace's Vercel deployments", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({ organizationId: ORG_A, title: "Inspect deployments", instruction: "List recent deployments", createdBy: "owner" })
    );
    const result = await runScheduler({ batchSize: 1, globalLimit: 2, perOrganizationLimit: 1, tool: "vercel_deployment_inspect" });
    const stored = await withCommanderScope(ORG_A, () => getTask({ organizationId: ORG_A, taskId: task.id }));
    const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
    console.log("E2E_VERCEL", JSON.stringify({ outcome: result.outcomes[0], status: stored?.status, summary: report?.resultSummary }));
    assert.equal(stored?.status, "completed", `vercel tool failed: ${result.outcomes[0]?.error}`);
    assert.equal(report?.status, "succeeded");
  }, 90_000);
});
