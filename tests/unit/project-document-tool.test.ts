import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { runWithCommanderDb } from "@/lib/db/tenant-context";
import * as schema from "@/lib/db/schema";
import { INTERNAL_WRITE_TOOLS } from "@/lib/agents/worker-types";
import { projectDocumentCreate } from "@/lib/agents/worker-tools/project-document";

vi.mock("server-only", () => ({}));

/**
 * The platform's first artifact-producing action.
 *
 * A document is a promise that something real was produced, so these tests care about the things
 * that would make that promise false: a body that is not the customer's words, a row in the wrong
 * workspace, a second run silently overwriting the first, or a credential copied into the text.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const TASK_A = "33333333-3333-4333-8333-333333333333";
const TASK_B = "44444444-4444-4444-8444-444444444444";

let pg: PGlite;

const apply = async (file: string) => {
  for (const part of readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8").split("--> statement-breakpoint")) {
    if (part.trim()) await pg.exec(part);
  }
};

beforeEach(async () => {
  pg = new PGlite();
  for (const file of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0033_decision_audit_uniqueness.sql",
    "pending/0034_agent_execution.sql",
    "pending/0035_worker_lease_and_scheduler.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
    "pending/0042_project_documents.sql",
  ]) {
    await apply(file);
  }
});

afterEach(async () => {
  await pg.close();
});

async function seed() {
  const db = drizzle(pg, { schema });
  await db.insert(schema.agentProject).values([
    { id: PROJECT_A, organizationId: A, name: "متجر التنظيف" },
    { id: PROJECT_B, organizationId: B, name: "B project" },
  ]);
  await db.insert(schema.agentTask).values([
    { id: TASK_A, organizationId: A, title: "A task", instruction: "Run", status: "pending", projectId: PROJECT_A },
    { id: TASK_B, organizationId: B, title: "B task", instruction: "Run", status: "pending", projectId: PROJECT_B },
  ]);
  return db;
}

const run = (
  db: Awaited<ReturnType<typeof seed>>,
  payload: Record<string, unknown>,
  extra?: { organizationId?: string; taskId?: string; signal?: AbortSignal }
) =>
  runWithCommanderDb(db, () =>
    projectDocumentCreate.run({
      organizationId: extra?.organizationId ?? A,
      agentId: "agent-a",
      taskId: extra?.taskId ?? TASK_A,
      payload,
      signal: extra?.signal ?? new AbortController().signal,
      fetchImpl: fetch,
    })
  );

const BRIEF = "نريد متجرًا إلكترونيًا لبيع منتجات التنظيف. الإطلاق قبل نهاية الربع. الشحن داخل الإمارات فقط.";

describe("project document action", () => {
  test("writes one real document into the caller's project", async () => {
    const db = await seed();
    const result = await run(db, { title: "خطة إطلاق المتجر", brief: BRIEF, projectId: PROJECT_A });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const rows = await db.select().from(schema.projectDocument);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].organizationId, A);
    assert.equal(rows[0].projectId, PROJECT_A);
    assert.equal(rows[0].taskId, TASK_A);
    assert.equal(rows[0].bytes, rows[0].body.length);
    assert.equal(rows[0].format, "markdown");
  });

  test("the body is the customer's own sentences, not invented content", async () => {
    const db = await seed();
    const result = await run(db, { title: "خطة", brief: BRIEF, projectId: PROJECT_A });
    assert.equal(result.ok, true);
    const [row] = await db.select().from(schema.projectDocument);
    for (const clause of ["متجرًا إلكترونيًا لبيع منتجات التنظيف", "الإطلاق قبل نهاية الربع", "الشحن داخل الإمارات فقط"]) {
      assert.ok(row.body.includes(clause), `missing clause: ${clause}`);
    }
    assert.match(row.body, /## الهدف/);
    assert.match(row.body, /## معايير القبول/);
    assert.match(row.body, /بلا استنتاج خارجي/);
    assert.ok(row.body.includes(TASK_A), "the document must name the task that produced it");
  });

  test("a project from another workspace is refused and nothing is written", async () => {
    const db = await seed();
    const result = await run(db, { title: "خطة", brief: BRIEF, projectId: PROJECT_B });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unknown_project");
    const rows = await db.select().from(schema.projectDocument);
    assert.equal(rows.length, 0, "a refused action must not leave a row behind");
  });

  test("invalid input is refused before the database is touched", async () => {
    const db = await seed();
    const cases: [Record<string, unknown>, string][] = [
      [{ title: "ab", brief: BRIEF, projectId: PROJECT_A }, "invalid_title"],
      [{ title: "خطة", brief: "قصير", projectId: PROJECT_A }, "invalid_brief"],
      [{ title: "خطة", brief: BRIEF }, "project_required"],
      [{ title: "خطة", brief: BRIEF, projectId: "not-a-uuid" }, "project_required"],
    ];
    for (const [payload, expected] of cases) {
      const result = await run(db, payload);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, expected);
    }
    const rows = await db.select().from(schema.projectDocument);
    assert.equal(rows.length, 0);
  });

  test("a cancelled run writes nothing", async () => {
    const db = await seed();
    const controller = new AbortController();
    controller.abort();
    const result = await run(db, { title: "خطة", brief: BRIEF, projectId: PROJECT_A }, { signal: controller.signal });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "aborted");
    const rows = await db.select().from(schema.projectDocument);
    assert.equal(rows.length, 0);
  });

  test("a credential in the brief never reaches the stored body", async () => {
    const db = await seed();
    const brief = `${BRIEF} واستخدم password=SuperSecret123 للمرحلة الأولى.`;
    const result = await run(db, { title: "خطة", brief, projectId: PROJECT_A });
    assert.equal(result.ok, true);
    const [row] = await db.select().from(schema.projectDocument);
    assert.ok(!row.body.includes("SuperSecret123"), "the secret must be redacted");
    assert.match(row.body, /\[redacted\]/);
  });

  test("one task cannot overwrite another run's document", async () => {
    const db = await seed();
    const first = await run(db, { title: "الأول", brief: BRIEF, projectId: PROJECT_A });
    assert.equal(first.ok, true);
    await assert.rejects(
      () => run(db, { title: "الثاني", brief: BRIEF, projectId: PROJECT_A }),
      /ProjectDocument_taskId_key|duplicate key/i
    );
    const rows = await db.select().from(schema.projectDocument);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "الأول");
  });

  test("documents stay inside their workspace", async () => {
    const db = await seed();
    await run(db, { title: "خطة", brief: BRIEF, projectId: PROJECT_A });
    const [row] = await db.select().from(schema.projectDocument);
    const visibleToB = await db
      .select()
      .from(schema.projectDocument)
      .where(and(eq(schema.projectDocument.id, row.id), eq(schema.projectDocument.organizationId, B)));
    assert.equal(visibleToB.length, 0);
  });

  test("the write tool is registered as an allowed internal write", async () => {
    assert.equal(projectDocumentCreate.readOnly, false);
    assert.equal(projectDocumentCreate.internalWrite, true);
    assert.equal(INTERNAL_WRITE_TOOLS.has(projectDocumentCreate.name), true);
    // A tool can claim the flag and still not be allowed: the list is what grants the run.
    assert.equal(INTERNAL_WRITE_TOOLS.has("some_other_write_tool"), false);
  });
});
