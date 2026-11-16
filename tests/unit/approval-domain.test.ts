import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({ resolveCaller: async () => null }));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    throw new Error("shared connection used: the request escaped its tenant scope");
  },
}));

import { withCommanderScope } from "@/lib/agents/commander-scope";
import {
  ApprovalDecisionError,
  decideApproval,
  requestApproval,
} from "@/lib/agents/command-center";

/**
 * The reason rule belongs to the domain.
 *
 * Every case here calls `decideApproval` directly, with no route, no HTTP and no
 * interface in between: that is the caller the rule has to survive.
 */

const ADMIN = process.env.ZOOKA_TEST_PG_ADMIN;
const RUNTIME = process.env.ZOOKA_TEST_PG_RUNTIME;
const ready = Boolean(ADMIN && RUNTIME);

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agent = (organizationId = ORG_A) =>
  ({
    id: AGENT_A,
    organizationId,
    slug: "a-agent",
    displayName: "A",
    role: "worker",
  }) as never;

let admin: ReturnType<typeof postgres>;

async function newApproval(organizationId = ORG_A) {
  return withCommanderScope(organizationId, () =>
    requestApproval(
      agent(organizationId),
      { organizationId, taskId: null, reason: "spends money" }
    )
  );
}

describe.skipIf(!ready)("decideApproval, called directly", () => {
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
      "pending/0038_schedule_and_agent_model.sql",
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
    await admin`delete from "AgentDecision"`;
    await admin`delete from "AgentApproval"`;
    await admin`delete from "AgentTask"`;
    await admin`delete from "AgentIdentity"`;
    await admin`insert into "AgentIdentity" (id, slug, "displayName", role, "keyHash", "organizationId")
                values (${AGENT_A},'a-agent','A','worker','ha',${ORG_A})`;
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe("select pg_advisory_unlock(727272)").catch(() => {});
    await admin?.end();
  });

  test("a rejection with no reason is refused at the domain", async () => {
    const approval = await newApproval();
    for (const reason of [undefined, "", "   ", "\n\t"]) {
      await assert.rejects(
        () =>
          withCommanderScope(ORG_A, () =>
            decideApproval({
              organizationId: ORG_A,
              approvalId: approval.id,
              decision: "rejected",
              decidedBy: "o",
              reason,
            })
          ),
        (error: unknown) =>
          error instanceof ApprovalDecisionError && error.code === "reason_required"
      );
    }
    // Still pending: refusals must not consume the approval.
    const [row] = await admin`select status from "AgentApproval" where id = ${approval.id}`;
    assert.equal(row.status, "pending");
  });

  test("a three-character reason is refused, a four-character one is accepted", async () => {
    const approval = await newApproval();
    await assert.rejects(
      () =>
        withCommanderScope(ORG_A, () =>
          decideApproval({
            organizationId: ORG_A,
            approvalId: approval.id,
            decision: "rejected",
            decidedBy: "o",
            reason: " no",
          })
        ),
      (error: unknown) => error instanceof ApprovalDecisionError && error.code === "reason_too_short"
    );

    const decided = await withCommanderScope(ORG_A, () =>
      decideApproval({
        organizationId: ORG_A,
        approvalId: approval.id,
        decision: "rejected",
        decidedBy: "o",
        reason: " nope",
      })
    );
    assert.equal(decided?.status, "rejected");
  });

  test("an over-long reason is refused rather than truncated", async () => {
    const approval = await newApproval();
    await assert.rejects(
      () =>
        withCommanderScope(ORG_A, () =>
          decideApproval({
            organizationId: ORG_A,
            approvalId: approval.id,
            decision: "rejected",
            decidedBy: "o",
            reason: "x".repeat(1001),
          })
        ),
      (error: unknown) => error instanceof ApprovalDecisionError && error.code === "reason_too_long"
    );
  });

  test("an approval needs no reason and is still recorded", async () => {
    const approval = await newApproval();
    const decided = await withCommanderScope(ORG_A, () =>
      decideApproval({ organizationId: ORG_A, approvalId: approval.id, decision: "approved", decidedBy: "o" })
    );
    assert.equal(decided?.status, "approved");
    assert.equal(decided?.decidedBy, "o");
  });

  test("two concurrent decisions produce exactly one winner", async () => {
    const approval = await newApproval();
    const decide = (decision: "approved" | "rejected") =>
      withCommanderScope(ORG_A, () =>
        decideApproval({
          organizationId: ORG_A,
          approvalId: approval.id,
          decision,
          decidedBy: decision === "approved" ? "yes" : "no",
          reason: "concurrent decision",
        }).catch((error) => (error instanceof ApprovalDecisionError ? null : Promise.reject(error)))
      );

    const results = await Promise.all([decide("approved"), decide("rejected")]);
    const winners = results.filter((row) => row !== null);
    assert.equal(winners.length, 1, "one decision won, the other changed no row");

    const [row] = await admin`select status from "AgentApproval" where id = ${approval.id}`;
    assert.equal(row.status, winners[0]!.status, "the stored status is the winner's");
  });

  test("another tenant cannot decide, and learns nothing", async () => {
    const approval = await newApproval(ORG_A);
    const crossed = await withCommanderScope(ORG_B, () =>
      decideApproval({
        organizationId: ORG_B,
        approvalId: approval.id,
        decision: "rejected",
        decidedBy: "o",
        reason: "not mine",
      })
    );
    assert.equal(crossed, null, "null, not an error that would confirm it exists");

    const [row] = await admin`select status from "AgentApproval" where id = ${approval.id}`;
    assert.equal(row.status, "pending", "untouched");
  });

  test("an approval that does not exist answers the same way", async () => {
    const missing = await withCommanderScope(ORG_A, () =>
      decideApproval({
        organizationId: ORG_A,
        approvalId: "99999999-9999-4999-8999-999999999999",
        decision: "approved",
        decidedBy: "o",
      })
    );
    assert.equal(missing, null);
  });
  test("a winning decision writes exactly one audit row, in the same transaction", async () => {
    const approval = await newApproval();
    await withCommanderScope(ORG_A, () =>
      decideApproval({
        organizationId: ORG_A,
        approvalId: approval.id,
        decision: "rejected",
        decidedBy: "o",
        reason: "unsafe migration",
      })
    );

    const rows = await admin`select state, body, "approvalId" from "AgentDecision" where "approvalId" = ${approval.id}`;
    assert.equal(rows.length, 1, "one decision, one record");
    assert.equal(rows[0].state, "APPROVAL_REJECTED");
    assert.equal(rows[0].body, "unsafe migration");
  });

  test("a losing or cross-tenant attempt leaves no audit row at all", async () => {
    const approval = await newApproval();
    await withCommanderScope(ORG_B, () =>
      decideApproval({
        organizationId: ORG_B,
        approvalId: approval.id,
        decision: "rejected",
        decidedBy: "x",
        reason: "not mine",
      })
    );
    const afterCross = await admin`select id from "AgentDecision" where "approvalId" = ${approval.id}`;
    assert.equal(afterCross.length, 0, "cross-tenant attempt wrote nothing");

    await withCommanderScope(ORG_A, () =>
      decideApproval({
        organizationId: ORG_A,
        approvalId: approval.id,
        decision: "approved",
        decidedBy: "o",
      })
    );
    const second = await withCommanderScope(ORG_A, () =>
      decideApproval({
        organizationId: ORG_A,
        approvalId: approval.id,
        decision: "rejected",
        decidedBy: "o",
        reason: "changed my mind",
      })
    );
    assert.equal(second, null, "the second decision lost");
    const after = await admin`select state from "AgentDecision" where "approvalId" = ${approval.id}`;
    assert.equal(after.length, 1, "still exactly one record");
    assert.equal(after[0].state, "APPROVAL_APPROVED", "the winner's record, not the loser's");
  });

  test("if the audit write fails, the decision rolls back with it", async () => {
    const approval = await newApproval();
    // Occupy the unique slot with a record the guard did not write, so the
    // domain's insert must violate the index.
    await admin`insert into "AgentDecision" (id, "organizationId", title, body, state, "approvalId")
                values (gen_random_uuid(), ${ORG_A}, 'pre-existing', 'x', 'APPROVAL_APPROVED', ${approval.id})`;

    await assert.rejects(() =>
      withCommanderScope(ORG_A, () =>
        decideApproval({
          organizationId: ORG_A,
          approvalId: approval.id,
          decision: "approved",
          decidedBy: "o",
        })
      )
    );

    const [row] = await admin`select status, "decidedBy" from "AgentApproval" where id = ${approval.id}`;
    assert.equal(row.status, "pending", "the state change rolled back, it did not half-commit");
    assert.equal(row.decidedBy, null);
  });
});
