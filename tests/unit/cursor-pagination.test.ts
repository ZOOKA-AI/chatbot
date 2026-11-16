import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import { createTask, listTaskPage } from "@/lib/agents/command-center";
import { decodeCursor, encodeCursor } from "@/lib/agents/pagination";

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let admin: ReturnType<typeof postgres>;

describe("cursor codec", () => {
  test("round-trips, and refuses anything it did not produce", () => {
    const when = new Date("2026-11-16T00:00:00.123Z");
    const id = "0b7f0c74-7f1e-4a0e-9c1a-6d0a1f3c9e21";
    const decoded = decodeCursor(encodeCursor(when, id));
    assert.ok(decoded);
    assert.equal(decoded!.id, id);
    assert.equal(decoded!.createdAt.toISOString(), when.toISOString());

    for (const bad of [
      "",
      null,
      undefined,
      "!!!not base64!!!",
      Buffer.from("no-separator").toString("base64url"),
      Buffer.from("2026-11-16T00:00:00Z|not-a-uuid").toString("base64url"),
      Buffer.from("not-a-date|0b7f0c74-7f1e-4a0e-9c1a-6d0a1f3c9e21").toString("base64url"),
      "x".repeat(201),
    ]) {
      assert.equal(decodeCursor(bad as string), null, String(bad));
    }
  });
});

describe.skipIf(!ready)("execution history paging on real PostgreSQL", () => {
  beforeAll(async () => {
    process.env.TENANT_RLS_ENABLED = "on";
    process.env.DATABASE_URL_TENANT = RUNTIME as string;
    admin = postgres(ADMIN as string, { max: 1 });
    await admin.unsafe("select pg_advisory_lock(727272)");

    const files = [
      "0027_agent_command_center.sql",
      "pending/0028_agent_tenant_scope.sql",
      "pending/0030_agent_rls_policies.sql",
      "pending/0031_tenant_runtime_role.sql",
      "pending/0033_decision_audit_uniqueness.sql",
    ];
    for (const name of files) {
      const body = readFileSync(join(process.cwd(), "lib/db/migrations", name), "utf8");
      for (const part of body.split("--> statement-breakpoint")) {
        const statement = part.trim();
        if (!statement) continue;
        try {
          await admin.unsafe(statement);
        } catch (error) {
          if (!/already exists|does not exist/i.test((error as Error).message)) throw error;
        }
      }
    }
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentDecision"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A})`;

    // 105 rows in A is deliberately past the 100 the old endpoint capped at.
    await withCommanderScope(ORG_A, async () => {
      for (let i = 0; i < 105; i += 1) {
        await createTask({
          organizationId: ORG_A,
          title: `task ${String(i).padStart(3, "0")}`,
          instruction: "x",
          createdBy: "owner-a",
        });
      }
    });
    await withCommanderScope(ORG_B, async () => {
      for (let i = 0; i < 3; i += 1) {
        await createTask({
          organizationId: ORG_B,
          title: `b task ${i}`,
          instruction: "x",
          createdBy: "owner-b",
        });
      }
    });

    // Five rows forced onto one timestamp: the case a naive cursor gets wrong.
    await admin`update "AgentTask" set "createdAt" = '2026-11-15 12:00:00+00'
                where id in (select id from "AgentTask" where "organizationId" = ${ORG_A} order by title limit 5)`;
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end();
  });

  test("more than a hundred records page through completely, each exactly once", async () => {
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof decodeCursor>;
    let pages = 0;

    for (;;) {
      const page = await withCommanderScope(ORG_A, () =>
        listTaskPage({ organizationId: ORG_A, limit: 20, cursor })
      );
      pages += 1;
      seen.push(...page.tasks.map((t) => t.id));
      if (!page.nextCursor) break;
      cursor = decodeCursor(page.nextCursor);
      assert.ok(cursor, "the server issues cursors it can read back");
      assert.ok(pages < 20, "paging terminates");
    }

    assert.equal(seen.length, 105, "every row visited");
    assert.equal(new Set(seen).size, 105, "no row repeated and none skipped");
    assert.equal(pages, 6, "105 rows at 20 per page");
  });

  /** Every row, in page order, for the whole-history assertions. */
  async function readAll(organizationId: string) {
    const rows: { id: string; createdAt: Date }[] = [];
    let cursor = null as ReturnType<typeof decodeCursor>;
    for (;;) {
      const page = await withCommanderScope(organizationId, () =>
        listTaskPage({ organizationId, limit: 40, cursor })
      );
      rows.push(...page.tasks.map((t) => ({ id: t.id, createdAt: t.createdAt })));
      if (!page.nextCursor) break;
      cursor = decodeCursor(page.nextCursor);
    }
    return rows;
  }

  test("ordering is stable when timestamps collide", async () => {
    const first = { tasks: await readAll(ORG_A) };
    const second = { tasks: await readAll(ORG_A) };
    const a = first.tasks.map((t) => t.id);
    const b = second.tasks.map((t) => t.id);
    assert.deepEqual(a, b, "two identical reads return the same order");

    // The five forced rows share one timestamp, so the tiebreak is doing the work.
    // Compared as a group rather than against an absolute instant: the column is
    // a naive timestamp, and the driver's zone handling is not what is under test.
    const groups = new Map<number, string[]>();
    for (const task of first.tasks) {
      const key = task.createdAt.getTime();
      groups.set(key, [...(groups.get(key) ?? []), task.id]);
    }
    const tiedGroup = [...groups.values()].find((ids) => ids.length === 5);
    assert.ok(tiedGroup, "the five forced rows share a timestamp");
    assert.deepEqual(tiedGroup, [...tiedGroup].sort().reverse(), "ties break by id, descending");
  });

  test("another tenant's rows never appear in this tenant's pages", async () => {
    const page = await withCommanderScope(ORG_A, () =>
      listTaskPage({ organizationId: ORG_A, limit: 100 })
    );
    assert.equal(page.tasks.filter((t) => t.organizationId !== ORG_A).length, 0);

    const other = await withCommanderScope(ORG_B, () =>
      listTaskPage({ organizationId: ORG_B, limit: 100 })
    );
    assert.equal(other.tasks.length, 3);
    assert.equal(other.tasks.every((t) => t.organizationId === ORG_B), true);
  });

  test("a cursor from one tenant is useless in another", async () => {
    const aPage = await withCommanderScope(ORG_A, () =>
      listTaskPage({ organizationId: ORG_A, limit: 5 })
    );
    const cursor = decodeCursor(aPage.nextCursor);
    assert.ok(cursor);

    const bPage = await withCommanderScope(ORG_B, () =>
      listTaskPage({ organizationId: ORG_B, limit: 5, cursor })
    );
    assert.equal(bPage.tasks.length, 0, "the keyset is filtered by tenant, not just by position");
  });

  test("the last page says so instead of offering another", async () => {
    const page = await withCommanderScope(ORG_B, () =>
      listTaskPage({ organizationId: ORG_B, limit: 100 })
    );
    assert.equal(page.nextCursor, null);
  });
});
