import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

const holder = vi.hoisted(() => ({
  db: null as ReturnType<typeof drizzle> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
  adminDb() {
    return holder.db;
  },
}));

import { eq } from "drizzle-orm";
import {
  copyAgentTemplate,
  createAgentTemplateLink,
  getPublicAgentTemplate,
  revokeAgentTemplateLink,
  serializeAgentTemplate,
} from "@/lib/agents/templates";
import { agentIdentity, agentSchedule, agentTask } from "@/lib/db/schema";

const SOURCE_ORG = "aaaaaaaa-5555-4555-8555-555555555555";
const VISITOR_ORG = "bbbbbbbb-6666-4666-8666-666666666666";
let pg: PGlite;
let originalTenantSetting: string | undefined;

async function apply(sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) {
      await pg.exec(statement);
    }
  }
}

beforeEach(async () => {
  originalTenantSetting = process.env.TENANT_RLS_ENABLED;
  process.env.TENANT_RLS_ENABLED = "off";
  pg = new PGlite();
  holder.db = drizzle(pg);
  for (const name of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
    "pending/0068_agent_template_links.sql",
  ]) {
    await apply(
      readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8")
    );
  }
});

afterEach(async () => {
  await pg.close();
  holder.db = null;
  if (originalTenantSetting === undefined) {
    delete process.env.TENANT_RLS_ENABLED;
  } else {
    process.env.TENANT_RLS_ENABLED = originalTenantSetting;
  }
});

async function createSourceAgent() {
  const { registerAgent, updateAgentConfig } = await import(
    "@/lib/agents/command-center"
  );
  const created = await registerAgent({
    organizationId: SOURCE_ORG,
    slug: "template-source",
    displayName: "Research agent",
    role: "researcher",
    scopes: ["task:read", "task:report"],
  });
  await updateAgentConfig({
    organizationId: SOURCE_ORG,
    agentId: created.agent.id,
    patch: {
      instructions: "Summarize public research.",
      allowedTools: ["github_repo_inspect"],
      modelProvider: "anthropic",
      modelId: "private-model-choice",
    },
  });
  return created;
}

function getDb() {
  if (!holder.db) {
    throw new Error("test database is not initialized");
  }
  return holder.db;
}

describe("agent template serialization", () => {
  test("contains only the intended, sanitized configuration", () => {
    const payload = serializeAgentTemplate(
      {
        id: "agent-secret-id",
        organizationId: SOURCE_ORG,
        displayName: "Research agent",
        role: "researcher",
        instructions: "Summarize public research.",
        scopes: ["task:read", "invalid:permission"],
        allowedTools: ["github_repo_inspect", "shell_exec"],
        keyHash: "SECRET_KEY_HASH",
        modelProvider: "anthropic",
        modelId: "private-model-choice",
        encryptedConnectorToken: "SECRET_CONNECTOR_TOKEN",
        chatHistory: "SECRET_CHAT_HISTORY",
      },
      [
        {
          title: "Daily review",
          instruction: "Review public changes.",
          tool: "github_repo_inspect",
          cronExpression: "0 9 * * *",
          timezone: "UTC",
          enabled: true,
          missedRunPolicy: "skip",
          organizationId: SOURCE_ORG,
          agentId: "agent-secret-id",
          lastRunAt: new Date().toISOString(),
          connectorToken: "SECRET_SCHEDULE_TOKEN",
        },
      ]
    );
    const serialized = JSON.stringify(payload);
    assert.deepEqual(Object.keys(payload), ["version", "agent", "schedules"]);
    assert.deepEqual(Object.keys(payload.agent), [
      "displayName",
      "role",
      "instructions",
      "scopes",
      "allowedTools",
    ]);
    assert.deepEqual(Object.keys(payload.schedules[0]), [
      "title",
      "instruction",
      "tool",
      "cronExpression",
      "timezone",
      "enabled",
      "missedRunPolicy",
    ]);
    assert.deepEqual(payload.agent.allowedTools, ["github_repo_inspect"]);
    assert.deepEqual(payload.agent.scopes, ["task:read"]);
    for (const secret of [
      "SECRET_KEY_HASH",
      "SECRET_CONNECTOR_TOKEN",
      "SECRET_CHAT_HISTORY",
      "SECRET_SCHEDULE_TOKEN",
      "private-model-choice",
      SOURCE_ORG,
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
  });
});

describe("agent template links and copies", () => {
  test("treats a missing template-link migration as an unavailable template", async () => {
    await pg.exec('DROP TABLE "AgentTemplateLink"');

    assert.equal(await getPublicAgentTemplate("A".repeat(43)), null);
  });
  test("a revoked token immediately stops resolving", async () => {
    const source = await createSourceAgent();
    const link = await createAgentTemplateLink({
      organizationId: SOURCE_ORG,
      agentId: source.agent.id,
    });
    assert.ok(link);
    assert.ok(await getPublicAgentTemplate(link.token));

    assert.equal(
      await revokeAgentTemplateLink({
        organizationId: SOURCE_ORG,
        agentId: source.agent.id,
      }),
      true
    );
    assert.equal(await getPublicAgentTemplate(link.token), null);
  });

  test("copies the sanitized agent and schedules only into the visitor workspace", async () => {
    const source = await createSourceAgent();
    await getDb()
      .insert(agentSchedule)
      .values([
        {
          organizationId: SOURCE_ORG,
          agentId: source.agent.id,
          title: "Daily review",
          instruction: "Review public changes.",
          tool: "github_repo_inspect",
          cronExpression: "0 9 * * *",
          timezone: "UTC",
          enabled: true,
          missedRunPolicy: "skip",
          createdBy: "owner",
        },
        {
          organizationId: SOURCE_ORG,
          agentId: null,
          title: "Workspace-only schedule",
          instruction: "Do not copy this schedule.",
          tool: "github_repo_inspect",
          cronExpression: "0 10 * * *",
          timezone: "UTC",
          enabled: true,
          missedRunPolicy: "skip",
          createdBy: "owner",
        },
      ]);
    const link = await createAgentTemplateLink({
      organizationId: SOURCE_ORG,
      agentId: source.agent.id,
    });
    assert.ok(link);

    const copy = await copyAgentTemplate(link.token, VISITOR_ORG);
    assert.ok(copy);
    assert.equal(copy.schedulesCreated, 1);
    assert.notEqual(copy.agent.id, source.agent.id);

    const agents = await getDb()
      .select({
        id: agentIdentity.id,
        organizationId: agentIdentity.organizationId,
        displayName: agentIdentity.displayName,
        scopes: agentIdentity.scopes,
        allowedTools: agentIdentity.allowedTools,
        instructions: agentIdentity.instructions,
        keyHash: agentIdentity.keyHash,
        modelProvider: agentIdentity.modelProvider,
      })
      .from(agentIdentity);
    const copies = agents.filter(
      (agent) => agent.organizationId === VISITOR_ORG
    );
    assert.equal(copies.length, 1);
    assert.equal(copies[0].id, copy.agent.id);
    assert.equal(copies[0].displayName, "Research agent");
    assert.deepEqual(copies[0].scopes, ["task:read", "task:report"]);
    assert.deepEqual(copies[0].allowedTools, ["github_repo_inspect"]);
    assert.equal(copies[0].instructions, "Summarize public research.");
    const sourceAgent = agents.find((agent) => agent.id === source.agent.id);
    assert.ok(sourceAgent);
    assert.notEqual(copies[0].keyHash, sourceAgent.keyHash);
    assert.equal(copies[0].modelProvider, null);

    const schedules = await getDb()
      .select({
        organizationId: agentSchedule.organizationId,
        agentId: agentSchedule.agentId,
        title: agentSchedule.title,
      })
      .from(agentSchedule);
    const copiedSchedules = schedules.filter(
      (schedule) => schedule.organizationId === VISITOR_ORG
    );
    assert.deepEqual(copiedSchedules, [
      {
        organizationId: VISITOR_ORG,
        agentId: copy.agent.id,
        title: "Daily review",
      },
    ]);
    assert.equal(
      agents.filter((agent) => agent.organizationId === SOURCE_ORG).length,
      1
    );
  });

  test("materialized schedules retain their assigned agent and selected tool", async () => {
    const source = await createSourceAgent();
    const [schedule] = await getDb()
      .insert(agentSchedule)
      .values({
        organizationId: SOURCE_ORG,
        agentId: source.agent.id,
        title: "Daily review",
        instruction: "Review public changes.",
        tool: "github_repo_inspect",
        cronExpression: "0 9 * * *",
        timezone: "UTC",
        enabled: true,
        missedRunPolicy: "skip",
        nextRunAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: agentSchedule.id });

    const { materialiseDueSchedules } = await import("@/lib/agents/schedule");
    const result = await materialiseDueSchedules({
      now: new Date(),
      organizationId: SOURCE_ORG,
    });
    assert.equal(result.created, 1);

    const [task] = await getDb()
      .select({
        ownerAgentId: agentTask.ownerAgentId,
        payload: agentTask.payload,
      })
      .from(agentTask)
      .where(eq(agentTask.scheduleId, schedule.id));
    assert.equal(task.ownerAgentId, source.agent.id);
    assert.deepEqual(task.payload, { tool: "github_repo_inspect" });
  });
});
