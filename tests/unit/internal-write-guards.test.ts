import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { agentAllowsTool } from "@/lib/agents/agent-tools";
import { INTERNAL_WRITE_TOOLS } from "@/lib/agents/worker-types";

/**
 * Can the internal-write allowlist be used to get around a permission or an approval?
 *
 * The allowlist answers one question only: may the worker run a tool that writes at all. It must
 * not answer "may this agent use this tool" and it must not answer "may this task run without
 * approval". Both of those are separate gates, and these tests hold them apart.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import { WORKER_TOOLS } from "@/lib/agents/worker";
import { claimTask, createTask, decideApproval, requestApproval } from "@/lib/agents/command-center";

const WRITE_TOOL = "project_document_create";
const ORG = "org-alpha";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

const agent = () =>
  ({
    id: AGENT_ID,
    organizationId: ORG,
    slug: "a-agent",
    displayName: "A",
    role: "worker",
    scopes: ["task:claim"],
  }) as never;

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  for (const file of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0033_decision_audit_uniqueness.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0039_launch_plan.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
  ]) {
    await apply(readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8"));
  }
  db = drizzle(pg, { schema });
  holder.db = db;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  for (const table of ["AgentApproval", "AgentTask", "AgentDecision", "AgentIdentity"]) {
    await pg.exec(`delete from "${table}"`);
  }
  await pg.query(
    `insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
     values ($1,'a-agent','A','worker','ha',$2)`,
    [AGENT_ID, ORG]
  );
});

describe("the allowlist grants the ability to write, nothing else", () => {
  test("a tool on the write list is still refused to an agent that was not granted it", () => {
    assert.equal(INTERNAL_WRITE_TOOLS.has(WRITE_TOOL), true, "the tool must be allowlisted for this test to mean anything");
    assert.equal(agentAllowsTool({ allowedTools: ["workspace_readiness_inspect"] }, WRITE_TOOL), false);
    assert.equal(agentAllowsTool({ allowedTools: [] }, WRITE_TOOL), false);
    assert.equal(agentAllowsTool({ allowedTools: [WRITE_TOOL] }, WRITE_TOOL), true);
  });

  test("an assigned agent gets the write tool and nothing else", () => {
    const assigned = { allowedTools: [WRITE_TOOL] };
    assert.equal(agentAllowsTool(assigned, WRITE_TOOL), true);
    assert.equal(agentAllowsTool(assigned, "workspace_readiness_inspect"), false, "one grant must not imply another");
  });

  test("every writing tool in the registry is on the list, and the list holds no phantom", () => {
    const writers = Object.values(WORKER_TOOLS).filter((tool) => !tool.readOnly).map((tool) => tool.name);
    assert.deepEqual(writers.sort(), [...INTERNAL_WRITE_TOOLS].sort());
    for (const name of INTERNAL_WRITE_TOOLS) {
      assert.ok(WORKER_TOOLS[name], `${name} is allowlisted but not registered as a tool`);
      assert.equal(WORKER_TOOLS[name].internalWrite, true, `${name} is allowlisted without declaring internalWrite`);
    }
  });

  test("an unknown tool name is not in the registry at all", () => {
    assert.equal(WORKER_TOOLS["project_document_delete"], undefined);
  });
});

describe("the allowlist does not bypass approval", () => {
  test("an approval-gated write task cannot be claimed before the decision", async () => {
    const task = await createTask({
      organizationId: ORG,
      title: `write: ${WRITE_TOOL}`,
      instruction: "produce the document",
      payload: { tool: WRITE_TOOL, projectId: "11111111-1111-4111-8111-111111111112" },
      approvalRequired: true,
      createdBy: "owner-1",
    });
    await requestApproval(agent(), { organizationId: ORG, taskId: task.id, reason: "a document will be written" });

    const blocked = await claimTask(agent(), task.id);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, "approval_required");

    const [approval] = await db.select().from(schema.agentApproval).limit(1);
    await decideApproval({
      organizationId: ORG,
      approvalId: approval.id,
      decision: "approved",
      decidedBy: "owner-1",
    });

    const allowed = await claimTask(agent(), task.id);
    assert.equal(allowed.ok, true, "after the decision the same task becomes claimable");
  });

  test("a rejected write task stays unclaimable", async () => {
    const task = await createTask({
      organizationId: ORG,
      title: `write: ${WRITE_TOOL}`,
      instruction: "produce the document",
      payload: { tool: WRITE_TOOL },
      approvalRequired: true,
      createdBy: "owner-1",
    });
    await requestApproval(agent(), { organizationId: ORG, taskId: task.id, reason: "a document will be written" });
    const [approval] = await db.select().from(schema.agentApproval).limit(1);
    await decideApproval({
      organizationId: ORG,
      approvalId: approval.id,
      decision: "rejected",
      decidedBy: "owner-1",
      reason: "not this quarter",
    });

    const result = await claimTask(agent(), task.id);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "approval_rejected");
  });
});
