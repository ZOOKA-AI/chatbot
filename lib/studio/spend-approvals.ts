import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";

/**
 * Permission to spend money, as a record that can only be spent once.
 *
 * The audit's finding was blunt: at 8cfb747 `decideSpend` accepted any non-empty `approvalReference`, so a
 * note in an environment variable authorised an unlimited number of billable jobs. A string cannot be owned,
 * priced, expired or revoked. A row can be, and the row is what this module manages.
 *
 * The properties that make it real, and the mechanism for each:
 *
 *   owned        organizationId and requestedBy are columns; every query filters by workspace
 *   priced       maxCostUsd is a ceiling, quotedCostUsd is the quote, and cost above the ceiling is refused
 *   dated        expiresAt is enforced by the database clock, not the caller's
 *   single-use   consumption is one conditional UPDATE; the row lock makes two attempts serialise
 *   idempotent   (organizationId, idempotencyKey) is unique, so a retried request returns the same row
 *   auditable    approvedBy, consumedAt and consumedByJobId are written and never cleared
 */

export type ApprovalStatus = "pending" | "approved" | "consumed" | "revoked" | "uncertain";

export type SpendApproval = InferSelectModel<typeof schema.studioSpendApproval>;

export class ApprovalError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ApprovalError";
  }
}

export type RequestApprovalInput = {
  organizationId: string;
  requestedBy: string;
  projectId?: string | null;
  provider: string;
  modelId: string;
  capability: string;
  operation: string;
  quotedCostUsd: number;
  /** What the owner authorises. Defaults to the quote; never larger than the quote unless stated. */
  maxCostUsd?: number;
  /** The caller's key for this request. The same key twice is the same request, not two budgets. */
  idempotencyKey: string;
  ttlMinutes?: number;
  note?: string | null;
};

const DEFAULT_TTL_MINUTES = 60;

function money(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new ApprovalError("invalid_cost");
  return value.toFixed(4);
}

/**
 * Creates the request, or returns the one already made under the same key.
 *
 * Unknown cost is refused here and not carried forward as zero: a quote that cannot be named cannot be
 * authorised.
 */
export async function requestApproval(input: RequestApprovalInput): Promise<SpendApproval> {
  if (!Number.isFinite(input.quotedCostUsd) || input.quotedCostUsd <= 0) {
    throw new ApprovalError("cost_unknown", "an approval needs a named cost");
  }
  const ceiling = input.maxCostUsd ?? input.quotedCostUsd;
  if (!Number.isFinite(ceiling) || ceiling < input.quotedCostUsd) {
    throw new ApprovalError("ceiling_below_quote", "the ceiling cannot be below the quoted cost");
  }
  const ttl = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new ApprovalError("invalid_ttl");

  const [row] = await db
    .insert(schema.studioSpendApproval)
    .values({
      organizationId: input.organizationId,
      requestedBy: input.requestedBy,
      projectId: input.projectId ?? null,
      provider: input.provider,
      modelId: input.modelId,
      capability: input.capability,
      operation: input.operation,
      quotedCostUsd: money(input.quotedCostUsd),
      maxCostUsd: money(ceiling),
      idempotencyKey: input.idempotencyKey,
      expiresAt: new Date(Date.now() + ttl * 60_000),
      note: input.note ?? null,
    })
    .onConflictDoNothing({
      target: [schema.studioSpendApproval.organizationId, schema.studioSpendApproval.idempotencyKey],
    })
    .returning();

  if (row) return row;

  const [existing] = await db
    .select()
    .from(schema.studioSpendApproval)
    .where(
      and(
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        eq(schema.studioSpendApproval.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (!existing) throw new ApprovalError("request_failed");
  return existing;
}

/**
 * A human authorises the ceiling. Only a pending request can be approved, and only inside its own
 * workspace, so a stale or foreign id changes nothing.
 */
export async function approveApproval(input: {
  organizationId: string;
  id: string;
  approvedBy: string;
  maxCostUsd?: number;
}): Promise<SpendApproval> {
  const patch: Record<string, unknown> = {
    status: "approved",
    approvedBy: input.approvedBy,
    approvedAt: sql`now()`,
    updatedAt: sql`now()`,
  };
  if (input.maxCostUsd !== undefined) {
    const ceiling = money(input.maxCostUsd);
    patch.maxCostUsd = ceiling;
  }

  const [row] = await db
    .update(schema.studioSpendApproval)
    .set(patch)
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        eq(schema.studioSpendApproval.status, "pending"),
        // A ceiling typed by an approver can never be below what was quoted; the CHECK protects the rest.
        input.maxCostUsd === undefined
          ? sql`true`
          : sql`${schema.studioSpendApproval.quotedCostUsd} <= ${money(input.maxCostUsd)}`
      )
    )
    .returning();

  if (row) return row;
  throw new ApprovalError(await whyNot( input.organizationId, input.id, "approve"));
}

/** Why a state change did not happen, so the caller reports a reason instead of a shrug. */
async function whyNot(organizationId: string, id: string, action: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.studioSpendApproval)
    .where(eq(schema.studioSpendApproval.id, id))
    .limit(1);
  if (!row) return "approval_not_found";
  if (row.organizationId !== organizationId) return "approval_not_in_workspace";
  if (row.status === "consumed") return "approval_already_consumed";
  if (row.status === "revoked") return "approval_revoked";
  if (row.status === "uncertain") return "approval_outcome_uncertain";
  if (new Date(row.expiresAt).getTime() <= Date.now()) return "approval_expired";
  if (action === "approve" && row.status !== "pending") return `approval_not_pending:${row.status}`;
  if (action === "consume" && row.status !== "approved") return `approval_not_approved:${row.status}`;
  return "approval_state_unexpected";
}

export type ConsumeInput = {
  organizationId: string;
  id: string;
  /** The provider's job id, when it is known before submission. The approval is bound to it. */
  jobId: string;
  /** What the job is expected to cost now. Above the ceiling is a refusal. */
  costUsd: number;
};

/**
 * Spends the approval, exactly once.
 *
 * One conditional UPDATE does all the work: the row lock serialises two callers, the WHERE clause enforces
 * workspace, status, expiry and ceiling, and a second caller sees zero rows changed. That is the whole
 * concurrency story, and it does not depend on the application remembering to check first.
 */
export async function consumeApproval(input: ConsumeInput): Promise<SpendApproval> {
  const cost = money(input.costUsd);
  const [row] = await db
    .update(schema.studioSpendApproval)
    .set({
      status: "consumed",
      consumedAt: sql`now()`,
      consumedByJobId: input.jobId,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        eq(schema.studioSpendApproval.status, "approved"),
        sql`${schema.studioSpendApproval.expiresAt} > now()`,
        sql`${schema.studioSpendApproval.maxCostUsd} >= ${cost}`
      )
    )
    .returning();

  if (row) return row;

  // Name the ceiling when that is what stopped it, rather than reporting an unexplained state.
  const [existing] = await db
    .select()
    .from(schema.studioSpendApproval)
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId)
      )
    )
    .limit(1);
  if (existing && existing.status === "approved" && Number(existing.maxCostUsd) < input.costUsd) {
    throw new ApprovalError("approval_above_ceiling");
  }
  throw new ApprovalError(await whyNot(input.organizationId, input.id, "consume"));
}

/**
 * The provider took the job but did not say what happened.
 *
 * This is deliberately not a release. An approval whose outcome is unknown must not become available again,
 * because "we are not sure whether we were charged" is the worst possible reason to try a second time.
 */
export async function markUncertain(input: {
  organizationId: string;
  id: string;
  jobId?: string | null;
  note?: string;
}): Promise<SpendApproval> {
  const [row] = await db
    .update(schema.studioSpendApproval)
    .set({
      status: "uncertain",
      consumedByJobId: input.jobId ?? null,
      consumedAt: sql`now()`,
      note: input.note ?? null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        eq(schema.studioSpendApproval.status, "consumed")
      )
    )
    .returning();
  if (row) return row;
  throw new ApprovalError(await whyNot(input.organizationId, input.id, "uncertain"));
}

/**
 * Records the provider's own job id against an approval that was already spent.
 *
 * Consumption happens before submission, because the window between "we submitted" and "we have an id" is
 * exactly when a crash would otherwise lose the fact that money was committed. The correlation id written at
 * consumption is replaced by the provider's id once it exists.
 */
export async function bindProviderJob(input: {
  organizationId: string;
  id: string;
  jobId: string;
}): Promise<SpendApproval> {
  const [row] = await db
    .update(schema.studioSpendApproval)
    .set({ consumedByJobId: input.jobId, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        eq(schema.studioSpendApproval.status, "consumed")
      )
    )
    .returning();
  if (row) return row;
  throw new ApprovalError(await whyNot(input.organizationId, input.id, "bind"));
}

/** Withdraws an approval that has not been spent. A consumed approval cannot be revoked. */
export async function revokeApproval(input: {
  organizationId: string;
  id: string;
  note?: string | null;
}): Promise<SpendApproval> {
  const [row] = await db
    .update(schema.studioSpendApproval)
    .set({ status: "revoked", note: input.note ?? null, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.studioSpendApproval.id, input.id),
        eq(schema.studioSpendApproval.organizationId, input.organizationId),
        sql`${schema.studioSpendApproval.status} in ('pending', 'approved')`
      )
    )
    .returning();
  if (row) return row;
  throw new ApprovalError(await whyNot(input.organizationId, input.id, "revoke"));
}

export async function getApproval(organizationId: string, id: string): Promise<SpendApproval | null> {
  const [row] = await db
    .select()
    .from(schema.studioSpendApproval)
    .where(
      and(
        eq(schema.studioSpendApproval.id, id),
        eq(schema.studioSpendApproval.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listApprovals(
  organizationId: string,
  options: { status?: ApprovalStatus; limit?: number } = {}
): Promise<SpendApproval[]> {
  const where = options.status
    ? and(
        eq(schema.studioSpendApproval.organizationId, organizationId),
        eq(schema.studioSpendApproval.status, options.status)
      )
    : eq(schema.studioSpendApproval.organizationId, organizationId);
  return db
    .select()
    .from(schema.studioSpendApproval)
    .where(where)
    .orderBy(desc(schema.studioSpendApproval.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

/**
 * Whether this approval may pay for this job, without spending it.
 * Used to show the approval screen the truth without consuming anything.
 */
export function approvalUsable(row: SpendApproval, costUsd: number): { ok: boolean; reason?: string } {
  if (row.status !== "approved") return { ok: false, reason: `not_approved:${row.status}` };
  if (new Date(row.expiresAt).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (costUsd > Number(row.maxCostUsd)) return { ok: false, reason: "above_ceiling" };
  return { ok: true };
}
