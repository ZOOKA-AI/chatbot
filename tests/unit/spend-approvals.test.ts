import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * An approval is the only thing standing between a customer request and somebody's bill, so it is tested
 * the way money is tested: what happens on the second attempt, on two simultaneous attempts, after expiry,
 * and from another workspace.
 *
 * The audit's finding at 8cfb747 was that any non-empty string authorised unlimited billable jobs. Each
 * test below fails against that implementation.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  ApprovalError,
  approvalUsable,
  approveApproval,
  bindProviderJob,
  consumeApproval,
  getApproval,
  listApprovals,
  markUncertain,
  requestApproval,
  revokeApproval,
} from "@/lib/studio/spend-approvals";

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const PROJECT_A = "11111111-1111-4111-8111-111111111111";

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  const sql = readFileSync(join(process.cwd(), "lib/db/migrations/pending/0045_spend_approvals.sql"), "utf8");
  await pg.exec(sql);
  holder.db = drizzle(pg, { schema }) as unknown as ReturnType<typeof drizzle>;
});

function base(overrides: Partial<Parameters<typeof requestApproval>[0]> = {}) {
  return {
    organizationId: ORG_A,
    requestedBy: "user-1",
    projectId: PROJECT_A,
    provider: "runcomfy-cloud",
    modelId: "flux-1-schnell",
    capability: "image_generate",
    operation: "generate_image",
    quotedCostUsd: 0.06,
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

async function approved(overrides: Partial<Parameters<typeof requestApproval>[0]> = {}) {
  const row = await requestApproval(base(overrides));
  return approveApproval({ organizationId: row.organizationId, id: row.id, approvedBy: "owner-1" });
}

describe("the approval record", () => {
  test("a repeated request key returns the same approval, not a second budget", async () => {
    const key = "same-request-key";
    const first = await requestApproval(base({ idempotencyKey: key }));
    const second = await requestApproval(base({ idempotencyKey: key }));
    assert.equal(first.id, second.id);
    const rows = await listApprovals(ORG_A);
    assert.equal(rows.length, 1);
  });

  test("an unknown cost is refused rather than treated as zero", async () => {
    await assert.rejects(() => requestApproval(base({ quotedCostUsd: 0 })), (error: unknown) => {
      assert.ok(error instanceof ApprovalError);
      assert.equal(error.code, "cost_unknown");
      return true;
    });
    await assert.rejects(
      () => requestApproval(base({ quotedCostUsd: Number.NaN })),
      (error: unknown) => error instanceof ApprovalError && error.code === "cost_unknown"
    );
  });

  test("a ceiling below the quote is refused", async () => {
    await assert.rejects(
      () => requestApproval(base({ maxCostUsd: 0.01 })),
      (error: unknown) => error instanceof ApprovalError && error.code === "ceiling_below_quote"
    );
  });
});

describe("approving", () => {
  test("records who approved and when", async () => {
    const row = await approved();
    assert.equal(row.status, "approved");
    assert.equal(row.approvedBy, "owner-1");
    assert.ok(row.approvedAt);
  });

  test("another workspace cannot approve it", async () => {
    const row = await requestApproval(base());
    await assert.rejects(
      () => approveApproval({ organizationId: ORG_B, id: row.id, approvedBy: "intruder" }),
      /approval_not_in_workspace/
    );
    const still = await getApproval(ORG_A, row.id);
    assert.equal(still?.status, "pending");
  });

  test("an approval id that does not exist changes nothing", async () => {
    await assert.rejects(
      () =>
        approveApproval({
          organizationId: ORG_A,
          id: "00000000-0000-4000-8000-000000000000",
          approvedBy: "owner-1",
        }),
      /approval_not_found/
    );
  });

  test("it cannot be approved twice", async () => {
    const row = await approved();
    await assert.rejects(
      () => approveApproval({ organizationId: ORG_A, id: row.id, approvedBy: "owner-2" }),
      /approval_not_pending/
    );
  });
});

describe("spending it", () => {
  test("spends once and names the job", async () => {
    const row = await approved();
    const consumed = await consumeApproval({
      organizationId: ORG_A,
      id: row.id,
      jobId: "spend:abc",
      costUsd: 0.06,
    });
    assert.equal(consumed.status, "consumed");
    assert.equal(consumed.consumedByJobId, "spend:abc");
  });

  test("a replay is refused, which is the whole point", async () => {
    const row = await approved();
    await consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.06 });
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-2", costUsd: 0.06 }),
      /approval_already_consumed/
    );
  });

  test("two simultaneous attempts produce exactly one job", async () => {
    const row = await approved();
    const attempts = await Promise.allSettled([
      consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-a", costUsd: 0.06 }),
      consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-b", costUsd: 0.06 }),
    ]);
    const wins = attempts.filter((entry) => entry.status === "fulfilled");
    const losses = attempts.filter((entry) => entry.status === "rejected");
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    const stored = await getApproval(ORG_A, row.id);
    assert.equal(stored?.status, "consumed");
    // The winner owns the job id; no second submission can claim this approval.
    assert.ok(["job-a", "job-b"].includes(String(stored?.consumedByJobId)));
  });

  test("another workspace cannot spend it", async () => {
    const row = await approved();
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_B, id: row.id, jobId: "job-x", costUsd: 0.06 }),
      /approval_not_in_workspace/
    );
    const stored = await getApproval(ORG_A, row.id);
    assert.equal(stored?.status, "approved");
  });

  test("a cost above the ceiling is refused by name", async () => {
    const row = await approved();
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.5 }),
      /approval_above_ceiling/
    );
    const stored = await getApproval(ORG_A, row.id);
    assert.equal(stored?.status, "approved");
  });

  test("an expired approval cannot be spent", async () => {
    const row = await requestApproval(base({ ttlMinutes: 1 }));
    await approveApproval({ organizationId: ORG_A, id: row.id, approvedBy: "owner-1" });
    await pg.exec(`update "StudioSpendApproval" set "expiresAt" = now() - interval '1 minute'`);
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.06 }),
      /approval_expired/
    );
  });

  test("an unapproved request cannot be spent", async () => {
    const row = await requestApproval(base());
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.06 }),
      /approval_not_approved/
    );
  });
});

describe("withdrawal and uncertainty", () => {
  test("a revoked approval cannot be spent", async () => {
    const row = await approved();
    await revokeApproval({ organizationId: ORG_A, id: row.id, note: "price changed" });
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.06 }),
      /approval_revoked/
    );
  });

  test("an uncertain outcome keeps the approval spent, so a retry cannot double bill", async () => {
    const row = await approved();
    await consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-1", costUsd: 0.06 });
    const uncertain = await markUncertain({ organizationId: ORG_A, id: row.id, jobId: "job-1", note: "timeout" });
    assert.equal(uncertain.status, "uncertain");
    await assert.rejects(
      () => consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "job-2", costUsd: 0.06 }),
      /approval_(already_consumed|outcome_uncertain)/
    );
  });

  test("the provider's own job id replaces the correlation id", async () => {
    const row = await approved();
    await consumeApproval({ organizationId: ORG_A, id: row.id, jobId: "spend:abc", costUsd: 0.06 });
    const bound = await bindProviderJob({ organizationId: ORG_A, id: row.id, jobId: "provider-42" });
    assert.equal(bound.consumedByJobId, "provider-42");
  });
});

describe("reading it back", () => {
  test("another workspace sees nothing", async () => {
    const row = await requestApproval(base());
    assert.equal(await getApproval(ORG_B, row.id), null);
    assert.deepEqual(await listApprovals(ORG_B), []);
  });

  test("usability is answered without spending", async () => {
    const row = await approved();
    assert.deepEqual(approvalUsable(row, 0.06), { ok: true });
    assert.equal(approvalUsable(row, 9).reason, "above_ceiling");
    const pending = await requestApproval(base());
    assert.equal(approvalUsable(pending, 0.06).reason, "not_approved:pending");
  });
});
