import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The request-session layer pulls Next internals that have no place in a unit run; nothing here uses it.
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));

// Loaded after the environment points at the test database, because `authenticateAgent` reads through the
// application's own connection rather than a tenant transaction.
type CommandCenter = typeof import("@/lib/agents/command-center");
type Scope = typeof import("@/lib/agents/commander-scope");
type Tools = typeof import("@/lib/agents/agent-tools");
type Worker = typeof import("@/lib/agents/worker");

let authenticateAgent: CommandCenter["authenticateAgent"];
let createTask: CommandCenter["createTask"];
let withCommanderScope: Scope["withCommanderScope"];
let agentAllowsTool: Tools["agentAllowsTool"];
let describeToolAssignment: Tools["describeToolAssignment"];
let runTask: Worker["runTask"];

/**
 * Authorization, exercised through the code that actually runs.
 *
 * The defect this file locks down was not in the policy rule, which was correct, but in the load that fed
 * it: `authenticateAgent` never selected `allowedTools`, so every authenticated agent arrived without a
 * policy and the rule read that absence as "unrestricted". Unit tests of the rule passed throughout, which
 * is precisely why the wire is what gets tested here.
 */

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const ready = Boolean(ADMIN);

const ORG_A = "33333333-3333-4333-8333-333333333333";
const ORG_B = "44444444-4444-4444-8444-444444444444";
const AGENT_RESTRICTED = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const AGENT_LEGACY = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
const AGENT_EMPTY = "aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa";
const AGENT_OTHER_ORG = "aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa";

const KEY_RESTRICTED = "zk_test_restricted_policy";
const KEY_LEGACY = "zk_test_legacy_policy";
const KEY_EMPTY = "zk_test_empty_policy";
const KEY_OTHER = "zk_test_other_org";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const bearer = (key: string) => new Request("http://localhost/api/agents/worker", {
  method: "POST",
  headers: { authorization: `Bearer ${key}` },
});

let admin: ReturnType<typeof postgres>;

describe.skipIf(!ready)("agent authorization", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL = ADMIN as string;
    // The execution path runs inside a tenant transaction; without a runtime connection it refuses to start,
    // which is itself the isolation guarantee rather than a test convenience.
    process.env.DATABASE_URL_TENANT = process.env.ZOOKA_TEST_PG_RUNTIME ?? process.env.DATABASE_URL_TENANT;
    process.env.WORKER_GITHUB_ALLOWED_REPOS = "zooka-ai/chatbot";
    process.env.TOKEN_ENCRYPTION_KEY =
      process.env.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");

    admin = postgres(ADMIN as string, { max: 2 });
    await admin.unsafe("select pg_advisory_lock(737373)");

    const files = [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
      "pending/0038_schedule_and_agent_model.sql",
      "pending/0039_launch_plan.sql",
      "pending/0040_agent_tools_and_instructions.sql",
      "pending/0041_workspace_projects.sql",
      "pending/0070_agent_permissions.sql",
      "pending/0034_agent_execution.sql",
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
    await admin`delete from "AgentIdentity" where slug like 'authz-%'`;

    ({ authenticateAgent, createTask } = await import("@/lib/agents/command-center"));
    ({ withCommanderScope } = await import("@/lib/agents/commander-scope"));
    ({ agentAllowsTool, describeToolAssignment } = await import("@/lib/agents/agent-tools"));
    ({ runTask } = await import("@/lib/agents/worker"));

    await admin`insert into "AgentIdentity"
        (id, slug, "displayName", role, "keyHash", "organizationId", "allowedTools", status)
      values
        (${AGENT_RESTRICTED}, 'authz-restricted', 'Restricted', 'worker', ${sha(KEY_RESTRICTED)}, ${ORG_A},
          ${admin.json(["project_document_create"])}, 'active'),
        (${AGENT_LEGACY}, 'authz-legacy', 'Legacy', 'worker', ${sha(KEY_LEGACY)}, ${ORG_A}, null, 'active'),
        (${AGENT_EMPTY}, 'authz-empty', 'Empty', 'worker', ${sha(KEY_EMPTY)}, ${ORG_A},
          ${admin.json([])}, 'active'),
        (${AGENT_OTHER_ORG}, 'authz-other', 'Other', 'worker', ${sha(KEY_OTHER)}, ${ORG_B},
          ${admin.json(["github_repo_inspect"])}, 'active')`;
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(737373)").catch(() => {});
    await admin?.end({ timeout: 5 });
  }, 30_000);

  test("the identity load carries the stored policy", async () => {
    const restricted = await authenticateAgent(bearer(KEY_RESTRICTED));
    assert.ok(restricted, "a valid key must authenticate");
    assert.deepEqual(restricted.allowedTools, ["project_document_create"]);

    const legacy = await authenticateAgent(bearer(KEY_LEGACY));
    assert.ok(legacy);
    assert.equal(legacy.allowedTools, null, "a stored NULL survives the load as NULL, not as undefined");
  });

  test("an explicit allowlist is not read as unrestricted", async () => {
    const restricted = await authenticateAgent(bearer(KEY_RESTRICTED));
    assert.ok(restricted);
    assert.equal(agentAllowsTool(restricted, "project_document_create"), true);
    assert.equal(agentAllowsTool(restricted, "github_repo_inspect"), false);
    assert.equal(agentAllowsTool(restricted, "sql_execute"), false);
  });

  test("an empty allowlist permits nothing, and NULL still means legacy", async () => {
    const empty = await authenticateAgent(bearer(KEY_EMPTY));
    const legacy = await authenticateAgent(bearer(KEY_LEGACY));
    assert.ok(empty && legacy);
    assert.equal(agentAllowsTool(empty, "github_repo_inspect"), false);
    assert.equal(describeToolAssignment(empty).mode, "restricted");
    assert.equal(agentAllowsTool(legacy, "github_repo_inspect"), true);
    assert.equal(describeToolAssignment(legacy).mode, "legacy_unrestricted");
  });

  test("an invalid key is refused outright", async () => {
    assert.equal(await authenticateAgent(bearer("zk_not_a_real_key")), null);
    assert.equal(await authenticateAgent(new Request("http://localhost/api/agents/worker")), null);
  });

  test("the worker refuses a disallowed tool even when the queue already holds the task", async () => {
    // This is the bypass that no HTTP test can reach: the row exists in AgentTask without the route
    // ever having approved anything. The executor must still refuse, and must not claim the task.
    const task = await withCommanderScope(ORG_A, () =>
      createTask({
        organizationId: ORG_A,
        title: "queued behind the route's back",
        instruction: "Read repository metadata",
        createdBy: "owner",
      })
    );

    const agent = await authenticateAgent(bearer(KEY_RESTRICTED));
    assert.ok(agent);

    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agent as never, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" } })
    );

    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "tool_not_assigned");

    const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "pending", "the refused task was never claimed");
  });

  test("an allowed tool passes the policy gate and fails only on what comes next", async () => {
    // Ordering matters: if the policy gate ran second, this would report a task error instead.
    const agent = await authenticateAgent(bearer(KEY_RESTRICTED));
    assert.ok(agent);
    const outcome = await withCommanderScope(ORG_A, () =>
      runTask(agent as never, { taskId: "99999999-9999-4999-8999-999999999999", tool: "project_document_create" })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "task_not_found", "the policy allowed it; the missing task is the only refusal");
  });

  test("another tenant's agent cannot run this workspace's task", async () => {
    const task = await withCommanderScope(ORG_A, () =>
      createTask({
        organizationId: ORG_A,
        title: "owned by A",
        instruction: "Read repository metadata",
        createdBy: "owner",
      })
    );
    const other = await authenticateAgent(bearer(KEY_OTHER));
    assert.ok(other);
    assert.equal(other.organizationId, ORG_B);

    const outcome = await withCommanderScope(ORG_B, () =>
      runTask(other as never, { taskId: task.id, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" } })
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "task_not_found");

    const [row] = await admin`select status from "AgentTask" where id = ${task.id}`;
    assert.equal(row.status, "pending");
  });
});
