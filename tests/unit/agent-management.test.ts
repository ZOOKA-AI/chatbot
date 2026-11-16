import assert from "node:assert/strict";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

/**
 * Agent management: what may be assigned, what may be stored, and what the execution path
 * then refuses.
 *
 * The defect these tests exist for is silent acceptance: a field validated by the parser and
 * dropped by the writer looks exactly like success from the API, and the customer discovers
 * it when the agent runs differently from what they configured.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import { agentAllowsTool, isKnownTool, toolCatalog, validateToolSelection } from "@/lib/agents/agent-tools";
import { parseAgentPatch } from "@/lib/agents/agent-config";

const ADMIN_URL = process.env.ZOOKA_TEST_PG_ADMIN;
const ORG_A = "aaaaaaaa-5555-4555-8555-555555555555";
const ORG_B = "bbbbbbbb-6666-4666-8666-666666666666";

describe("the tool catalogue comes from the worker", () => {
  test("every listed tool is one the worker implements", () => {
    const catalog = toolCatalog();
    assert.ok(catalog.length >= 2);
    for (const entry of catalog) {
      assert.ok(isKnownTool(entry.id), `${entry.id} is offered but not implemented`);
      assert.ok(entry.summary.length > 10, `${entry.id} needs a real description`);
    }
  });

  test("an unimplemented tool is not offered and not known", () => {
    assert.equal(isKnownTool("delete_everything"), false);
    assert.ok(!toolCatalog().some((entry) => entry.id === "delete_everything"));
  });
});

describe("tool selection is validated before it is stored", () => {
  test("null clears the restriction", () => {
    assert.deepEqual(validateToolSelection(null), { ok: true, tools: null });
  });

  test("an empty selection is refused, not stored", () => {
    const result = validateToolSelection([]);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "allowed_tools_empty");
  });

  test("an unknown tool is refused by name", () => {
    const result = validateToolSelection(["github_repo_inspect", "shell_exec"]);
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /unknown_tool:shell_exec/);
  });

  test("duplicates collapse, so the stored value is what was meant", () => {
    const result = validateToolSelection(["github_repo_inspect", "github_repo_inspect"]);
    assert.deepEqual(result, { ok: true, tools: ["github_repo_inspect"] });
  });

  test("non-strings are refused rather than coerced", () => {
    assert.equal(validateToolSelection([42]).ok, false);
  });
});

describe("the patch parser accepts the real configuration fields", () => {
  test("tools and instructions are accepted", () => {
    const parsed = parseAgentPatch({
      allowedTools: ["github_repo_inspect"],
      instructions: "  Always summarise in one paragraph.  ",
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual((parsed as { patch: { allowedTools: string[] } }).patch.allowedTools, ["github_repo_inspect"]);
    assert.equal(
      (parsed as { patch: { instructions: string } }).patch.instructions,
      "Always summarise in one paragraph."
    );
  });

  test("an unknown field is still refused", () => {
    const parsed = parseAgentPatch({ allowedTools: ["github_repo_inspect"], organizationId: "org-b" });
    assert.equal(parsed.ok, false);
    assert.match((parsed as { error: string }).error, /unknown_fields:organizationId/);
  });

  test("over-long instructions are refused", () => {
    const parsed = parseAgentPatch({ instructions: "x".repeat(4001) });
    assert.equal(parsed.ok, false);
    assert.equal((parsed as { error: string }).error, "instructions_too_long");
  });

  test("an empty instruction string clears rather than storing whitespace", () => {
    const parsed = parseAgentPatch({ instructions: "   " });
    assert.equal((parsed as { patch: { instructions: string | null } }).patch.instructions, null);
  });

  test("an unknown tool in a patch is refused", () => {
    const parsed = parseAgentPatch({ allowedTools: ["rm_rf"] });
    assert.equal(parsed.ok, false);
  });
});

describe("enforcement uses the stored assignment", () => {
  test("an unrestricted agent may run any supported tool", () => {
    assert.equal(agentAllowsTool({ allowedTools: null }, "github_repo_inspect"), true);
    assert.equal(agentAllowsTool({ allowedTools: undefined }, "vercel_deployment_inspect"), true);
  });

  test("a restricted agent may run only what it was assigned", () => {
    assert.equal(agentAllowsTool({ allowedTools: ["github_repo_inspect"] }, "github_repo_inspect"), true);
    assert.equal(agentAllowsTool({ allowedTools: ["github_repo_inspect"] }, "vercel_deployment_inspect"), false);
  });

  test("a malformed stored value fails closed", () => {
    assert.equal(agentAllowsTool({ allowedTools: "github_repo_inspect" }, "github_repo_inspect"), false);
  });
});

const suite = ADMIN_URL ? describe : describe.skip;
let sql: ReturnType<typeof postgres> | null = null;
let center: typeof import("@/lib/agents/command-center") | null = null;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  process.env.DATABASE_URL = ADMIN_URL;
  process.env.TENANT_RLS_ENABLED = "off";
  sql = postgres(ADMIN_URL, { max: 2, onnotice: () => {} });
  holder.db = drizzle(sql);
  center = await import("@/lib/agents/command-center");
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

suite("a saved configuration is what the database holds", () => {
  test("model, tools and instructions are persisted, not dropped", async () => {
    const created = await center!.registerAgent({
      organizationId: ORG_A,
      slug: `agent-${Date.now()}`,
      displayName: "Research agent",
      role: "researcher",
      scopes: ["task:read"],
    });

    const updated = await center!.updateAgentConfig({
      organizationId: ORG_A,
      agentId: created.agent.id,
      patch: {
        modelProvider: "anthropic",
        modelId: "claude-sonnet-5",
        allowedTools: ["github_repo_inspect"],
        instructions: "Cite the commit hash for every claim.",
      },
    });

    assert.ok(updated);
    // The regression: these three used to be accepted and never written.
    assert.equal((updated as { modelProvider: string }).modelProvider, "anthropic");
    assert.equal((updated as { modelId: string }).modelId, "claude-sonnet-5");
    assert.deepEqual((updated as { allowedTools: string[] }).allowedTools, ["github_repo_inspect"]);
    assert.equal((updated as { instructions: string }).instructions, "Cite the commit hash for every claim.");
  });

  test("clearing the restriction is possible and means unrestricted", async () => {
    const created = await center!.registerAgent({
      organizationId: ORG_A,
      slug: `agent-clear-${Date.now()}`,
      displayName: "Cleared agent",
      role: "worker",
      scopes: [],
    });
    await center!.updateAgentConfig({
      organizationId: ORG_A,
      agentId: created.agent.id,
      patch: { allowedTools: ["github_repo_inspect"] },
    });
    const cleared = await center!.updateAgentConfig({
      organizationId: ORG_A,
      agentId: created.agent.id,
      patch: { allowedTools: null },
    });
    assert.equal((cleared as { allowedTools: unknown }).allowedTools, null);
  });

  test("another workspace cannot change the configuration", async () => {
    const created = await center!.registerAgent({
      organizationId: ORG_A,
      slug: `agent-scope-${Date.now()}`,
      displayName: "Scoped agent",
      role: "worker",
      scopes: [],
    });

    const attempt = await center!.updateAgentConfig({
      organizationId: ORG_B,
      agentId: created.agent.id,
      patch: { displayName: "hijacked", allowedTools: null },
    });
    assert.equal(attempt, null);

    const [row] = await sql!`select "displayName" from "AgentIdentity" where id = ${created.agent.id}`;
    assert.equal(row.displayName, "Scoped agent");
  });
});
