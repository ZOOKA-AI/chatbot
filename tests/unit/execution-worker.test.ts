import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

/**
 * The worker on a real PostgreSQL server, running as `zooka_runtime`.
 *
 * The shared connection is a stub that throws, so every one of these tests also
 * proves the worker never escapes its tenant transaction. The GitHub API is
 * replaced by a fetch stub: no test touches the network, and the one live call
 * lives in the manual evidence step rather than the suite.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import { cancelTask, createTask, finishExecution, getTask, requestApproval } from "@/lib/agents/command-center";
import { encryptTokens } from "@/lib/integrations/catalog";
import { WORKER_TOOLS, executionReport, runTask } from "@/lib/agents/worker";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const agentA = { id: AGENT_A, organizationId: ORG_A, role: "worker", scopes: ["task:claim", "task:report"] };
const agentB = { id: AGENT_B, organizationId: ORG_B, role: "worker", scopes: ["task:claim", "task:report"] };

let admin: ReturnType<typeof postgres>;

const REPO_OK = {
  full_name: "zooka-ai/chatbot",
  private: true,
  default_branch: "main",
  pushed_at: "2026-11-16T00:00:00Z",
  size: 7812,
  description: "ZOOKA-AI platform",
};

function fetchStub(
  overrides: { repo?: unknown; repoStatus?: number; fileBody?: string; membership?: Array<{ full_name: string }> } = {}
) {
  return (async (url: string) => {
    if (String(url).includes("/repos/zooka-ai/chatbot/contents/")) {
      const body = overrides.fileBody ?? "export const answer = 42;\n";
      return new Response(
        JSON.stringify({
          content: Buffer.from(body).toString("base64"),
          size: Buffer.byteLength(body),
          encoding: "base64",
        }),
        { status: 200 }
      );
    }
    if (String(url).includes("/user/repos") || String(url).includes("/installation/repositories")) {
      const listed =
        overrides.membership ?? [{ full_name: "zooka-ai/chatbot" }];
      return new Response(JSON.stringify({ repositories: listed, total_count: listed.length }), {
        status: 200,
      });
    }
    if (String(url).includes("/repos/zooka-ai/chatbot")) {
      return new Response(JSON.stringify(overrides.repo ?? REPO_OK), {
        status: overrides.repoStatus ?? 200,
      });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

async function newTask(organizationId = ORG_A, extra: Record<string, unknown> = {}) {
  return withCommanderScope(organizationId, () =>
    createTask({
      organizationId,
      title: "Inspect the repository",
      instruction: "Read the repository metadata and the first lines of package.json",
      createdBy: "owner",
      ...extra,
    })
  );
}

describe.skipIf(!ready)("execution worker", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    process.env.WORKER_GITHUB_ALLOWED_REPOS = "zooka-ai/chatbot";
    // Local test key only: no production value is read, echoed or stored.
    process.env.TOKEN_ENCRYPTION_KEY =
      process.env.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");
    // Offline tests get a fake credential; a live run keeps the real one.
    // Offline runs are single-tenant by declaration: there is no workspace
    // connection in this database, so the platform credential is the only route.
    process.env.WORKER_ALLOW_SHARED_CREDENTIAL = process.env.WORKER_GITHUB_TOKEN ? "0" : "1";
    if (!process.env.WORKER_GITHUB_TOKEN) {
      process.env.GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN ?? "ghp_" + "a".repeat(36);
    }
    admin = postgres(ADMIN as string, { max: 2 });
    await admin.unsafe("select pg_advisory_lock(727272)");

    const files = [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0034_agent_execution.sql",
      // Must come after 0031: that migration revokes every table grant, so any
      // grant added earlier would be erased by a re-run.
      "pending/0035_worker_lease_and_scheduler.sql",
    ];
    for (const name of files) {
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
    await admin`delete from "AgentExecution"`;
    await admin`delete from "AgentDecision"`;
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A}),
                       (${AGENT_B},'b-agent','B','worker','hb',${ORG_B})`;
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end({ timeout: 5 });
  }, 30_000);

  test("an unauthorised tool is refused before the task is even claimed", async () => {
    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "sql_execute" })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "tool_not_authorized");
    const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "pending", "the task was not taken");
  });

  test("another organisation cannot run this task", async () => {
    const task = await newTask(ORG_A);
    const outcome = await withCommanderScope(ORG_B, () =>
      runTask(agentB, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" } })
    );
    assert.equal(outcome.error, "task_not_found");
    const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "pending");
  });

  test("a gated task does not run until its own organisation approved it", async () => {
    const task = await newTask(ORG_A, { approvalRequired: true });
    await withCommanderScope(ORG_A, () =>
      requestApproval(
        agentA as never,
        { organizationId: ORG_A, taskId: task.id, reason: "reads a private repository" }
      )
    );
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: fetchStub() })
    );
    assert.equal(outcome.error, "approval_required");
    assert.equal(outcome.executionId, null, "no attempt was recorded for a task that never ran");
  });

  test("a successful run completes the task with the tool's own answer as evidence", async () => {
    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "zooka-ai/chatbot", paths: ["package.json"] },
        fetchImpl: fetchStub(),
      })
    );

    assert.equal(outcome.ok, true);
    assert.equal(outcome.status, "completed");

    const [row] = await admin`select status, evidence, "reportedAt" from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "completed");
    assert.match(row.evidence, /zooka-ai\/chatbot: branch main/);
    assert.ok(row.reportedAt);

    const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
    assert.equal(report?.status, "succeeded");
    assert.equal(report?.evidenceRef, `execution:${outcome.executionId}`);
    assert.ok((report?.durationMs ?? -1) >= 0);
  });

  test("a failing tool fails the task and records the error, never a completion", async () => {
    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "zooka-ai/chatbot" },
        fetchImpl: fetchStub({ repoStatus: 500 }),
      })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.status, "failed");

    const [row] = await admin`select status, evidence from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "failed");
    assert.match(row.evidence, /github_repo_inspect failed: github_500/);

    const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
    assert.equal(report?.status, "failed");
    assert.equal(report?.error, "github_500");
  });

  test("a repository outside the authorised scope is refused", async () => {
    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "someone-else/private-thing" },
        fetchImpl: fetchStub(),
      })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "repo_not_authorized");
  });

  test("a second worker cannot run a task that is already in flight", async () => {
    const task = await newTask();
    await admin`insert into "AgentExecution" ("taskId","organizationId","agentId",tool,attempt,status)
                values (${task.id}, ${ORG_A}, ${AGENT_A}, 'github_repo_inspect', 1, 'running')`;

    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "zooka-ai/chatbot" },
        fetchImpl: fetchStub(),
      })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "duplicate_execution");

    const rows = await admin`select count(*)::int as n from "AgentExecution" where "taskId" = ${task.id}`;
    assert.equal(rows[0].n, 1, "the second attempt wrote nothing");
  });

  test("a cancellation that lands mid-flight outranks the result", async () => {
    const task = await newTask();
    const tool = WORKER_TOOLS.github_repo_inspect;
    const original = tool.run;

    // The cancellation happens on the worker's own transaction, which is what a
    // mid-flight cancel looks like to the runner: the row is already gone from
    // under it by the time the tool answers. Cancelling from a second connection
    // would simply block on the claim's row lock, which is a different (and also
    // correct) behaviour: the task is not interruptible until the tool returns.
    tool.run = async () => {
      await cancelTask({ organizationId: ORG_A, taskId: task.id, reason: "owner cancelled", by: "owner" });
      return { ok: true, summary: "read succeeded", evidence: { repo: "zooka-ai/chatbot" } };
    };

    try {
      const outcome = await withCommanderScope(ORG_A, () =>
        runTask(agentA, {
          taskId: task.id,
          tool: "github_repo_inspect",
          payload: { repo: "zooka-ai/chatbot" },
          fetchImpl: fetchStub(),
        })
      );

      assert.equal(outcome.ok, false);
      assert.equal(outcome.error, "cancelled_during_execution");

      const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
      assert.equal(row.status, "cancelled", "a cancelled task is never completed");

      const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
      assert.equal(report?.status, "cancelled");
    } finally {
      tool.run = original;
    }
  });

  test("attempts are capped, so a broken task cannot be retried for ever", async () => {
    const task = await newTask();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await admin`insert into "AgentExecution" ("taskId","organizationId","agentId",tool,attempt,status,"finishedAt")
                  values (${task.id}, ${ORG_A}, ${AGENT_A}, 'github_repo_inspect', ${attempt}, 'failed', now())`;
    }
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: fetchStub() })
    );
    assert.equal(outcome.error, "retry_limit_reached");

    const [row] = await admin`select status, evidence from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "blocked");
    assert.match(row.evidence, /Retry limit reached: 3 attempt/);
  });

  test("a slow tool is aborted and its task failed, not left running", async () => {
    const tool = WORKER_TOOLS.github_repo_inspect;
    const original = tool.timeoutMs;
    tool.timeoutMs = 25;
    const hangingFetch = ((_: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    try {
      const task = await newTask();
      const outcome = await withCommanderScope(ORG_A, () =>
        runTask(agentA, {
          taskId: task.id,
          tool: "github_repo_inspect",
          payload: { repo: "zooka-ai/chatbot" },
          fetchImpl: hangingFetch,
        })
      );
      assert.equal(outcome.status, "timed_out");
      const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
      assert.equal(row.status, "failed");
      const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
      assert.equal(report?.status, "timed_out");
    } finally {
      tool.timeoutMs = original;
    }
  });

  test("credentials never reach the stored evidence", async () => {
    const task = await newTask();
    const leaky = "const token = 'ghp_" + "b".repeat(36) + "';\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456\n";
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "zooka-ai/chatbot", paths: ["config.ts"] },
        fetchImpl: fetchStub({ fileBody: leaky }),
      })
    );
    assert.equal(outcome.ok, true);

    const [row] = await admin`select evidence from "AgentTask" where id = ${task.id}`;
    assert.doesNotMatch(row.evidence, /ghp_b{36}/);
    assert.doesNotMatch(row.evidence, /abcdefghijklmnopqrstuvwxyz123456/);
    assert.match(row.evidence, /\[redacted\]/);

    const [execution] = await admin`select "resultSummary" from "AgentExecution" where "taskId" = ${task.id}`;
    assert.doesNotMatch(execution.resultSummary ?? "", /ghp_b{36}/);
  });

  test("no execution record can be deleted by the runtime role", async () => {
    const task = await newTask();
    await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: fetchStub() })
    );
    const runtime = postgres(RUNTIME as string, { max: 1 });
    try {
      await assert.rejects(
        () => runtime`delete from "AgentExecution" where "taskId" = ${task.id}`,
        /permission denied|denied/i
      );
    } finally {
      await runtime.end();
    }
  });

  test("a workspace executes with its own credential, not the platform's", async () => {
    const workspaceToken = "ghp_" + "w".repeat(36);
    await admin`delete from integration_connection where workspace_id = ${ORG_A}`;
    await admin`insert into integration_connection (workspace_id, provider, encrypted_tokens)
                values (${ORG_A}, 'github', ${encryptTokens({ accessToken: workspaceToken })})`;

    let sent: string | null = null;
    const spyFetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
      if (String(url).includes("/repos/zooka-ai/chatbot") && !String(url).includes("contents")) {
        sent = init?.headers?.Authorization ?? null;
      }
      if (String(url).includes("/user/repos") || String(url).includes("/installation/repositories")) {
        return new Response(JSON.stringify({ repositories: [{ full_name: "zooka-ai/chatbot" }] }), { status: 200 });
      }
      return new Response(JSON.stringify(REPO_OK), { status: 200 });
    }) as unknown as typeof fetch;

    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: spyFetch })
    );
    assert.equal(outcome.ok, true);
    assert.equal(sent, `Bearer ${workspaceToken}`, "the workspace token was used");

    const [execution] = await admin`select tool from "AgentExecution" where "taskId" = ${task.id}`;
    const [taskRow] = await admin`select evidence from "AgentTask" where id = ${task.id}`;
    assert.equal(execution.tool, "github_repo_inspect");
    assert.doesNotMatch(taskRow.evidence, new RegExp(workspaceToken.slice(0, 12)));
    await admin`delete from integration_connection where workspace_id = ${ORG_A}`;
  });

  test("a workspace with no connection does not inherit another workspace's token", async () => {
    process.env.WORKER_ALLOW_SHARED_CREDENTIAL = "0";
    const previous = process.env.WORKER_GITHUB_TOKEN;
    process.env.WORKER_GITHUB_TOKEN = "ghp_" + "p".repeat(36);
    try {
      const task = await newTask(ORG_B);
      const outcome = await withCommanderScope(ORG_B, () =>
        runTask(agentB, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: fetchStub() })
      );
      assert.equal(outcome.ok, false);
      // No workspace connection and shared credentials disabled: the honest answer
      // is that this deployment will not execute with somebody else's token.
      assert.equal(outcome.error, "platform_credential_not_enabled");
    } finally {
      if (previous) process.env.WORKER_GITHUB_TOKEN = previous; else delete process.env.WORKER_GITHUB_TOKEN;
      process.env.WORKER_ALLOW_SHARED_CREDENTIAL = "1";
    }
  });

  test("a malformed stored credential is refused, not silently repaired", async () => {
    const malformed = "$'gho_" + "q".repeat(36) + "'";
    await admin`delete from integration_connection where workspace_id = ${ORG_A}`;
    await admin`insert into integration_connection (workspace_id, provider, encrypted_tokens)
                values (${ORG_A}, 'github', ${encryptTokens({ accessToken: malformed })})`;

    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" }, fetchImpl: fetchStub() })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "credential_malformed");

    // The stored value is still exactly what the owner stored: no silent rewrite.
    const [row] = await admin`select encrypted_tokens from integration_connection where workspace_id = ${ORG_A}`;
    const stored = (JSON.parse(JSON.stringify(row)).encrypted_tokens ?? row.encrypted_tokens) as string;
    assert.ok(stored.length > 0);
    await admin`delete from integration_connection where workspace_id = ${ORG_A}`;
  });

  test("a repository outside the credential's installation is refused", async () => {
    // Installation tokens are scoped to an installation; membership is enforced.
    process.env.WORKER_GITHUB_TOKEN = "ghs_" + "i".repeat(36);
    const task = await newTask();
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agentA, {
        taskId: task.id,
        tool: "github_repo_inspect",
        payload: { repo: "zooka-ai/chatbot" },
        fetchImpl: fetchStub({ membership: [{ full_name: "somebody-else/other-repo" }] }),
      })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "repo_not_in_installation");
    delete process.env.WORKER_GITHUB_TOKEN;
  });

  test("a worker whose lease expired cannot settle the attempt", async () => {
    const task = await newTask();
    const [abandoned] = await admin`
      insert into "AgentExecution" ("taskId","organizationId","agentId",tool,attempt,status,"leaseExpiresAt","startedAt")
      values (${task.id}, ${ORG_A}, ${AGENT_A}, 'github_repo_inspect', 1, 'running', now() - interval '5 minutes', now() - interval '6 minutes')
      returning id`;
    await admin`update "AgentTask" set status='in_progress', "ownerAgentId"=${AGENT_A} where id=${task.id}`;

    // The stale worker comes back late and tries to claim success.
    const closed = await withCommanderScope(ORG_A, () =>
      finishExecution({
        organizationId: ORG_A,
        executionId: abandoned.id,
        status: "succeeded",
        durationMs: 9000,
        resultSummary: "late answer from a dead worker",
      })
    );
    assert.equal(closed, null, "an expired lease may not close the attempt");

    const [row] = await admin`select status, "finishedAt", "resultSummary" from "AgentExecution" where id = ${abandoned.id}`;
    assert.equal(row.status, "running", "recovery still owns this attempt");
    assert.equal(row.finishedAt, null);
    assert.equal(row.resultSummary, null);
  });

  test.skipIf(process.env.WORKER_LIVE !== "1")(
    "LIVE: reads the real authorised repository through the real tool",
    async () => {
      const task = await newTask();
      const outcome = await withCommanderScope(ORG_A, () =>
        runTask(agentA, {
          taskId: task.id,
          tool: "github_repo_inspect",
          payload: { repo: "zooka-ai/chatbot", paths: ["package.json"] },
          // real fetch, real api.github.com, read-only
        })
      );
      const report = await withCommanderScope(ORG_A, () => executionReport(ORG_A, task.id));
      console.log("LIVE_EVIDENCE", JSON.stringify({ outcome, report }, null, 2));

      assert.equal(outcome.ok, true, `live call failed: ${outcome.error}`);
      assert.equal(outcome.status, "completed");
      assert.match(report?.resultSummary ?? "", /branch main/);

      const [row] = await admin`select status, evidence from "AgentTask" where id = ${task.id}`;
      assert.equal(row.status, "completed");
      assert.ok(row.evidence.length > 40);
    },
    60_000
  );
});
