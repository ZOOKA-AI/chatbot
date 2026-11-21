import "server-only";

import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { adminDb, db } from "@/lib/db/queries";
import { tiktokPublishEvent, tiktokPublishJob } from "@/lib/db/schema";

/**
 * The handoff between n8n and the creator's token.
 *
 * n8n schedules; it never sees a token. A job row is the contract: whoever holds
 * the job key can ask for the upload, and the unique key makes a retried request
 * a no-op instead of a second video in someone's inbox.
 */

export const MAX_ATTEMPTS = 3;
/** Retry delays: 1m, 2m, 4m ... capped, so a transient outage is not hammered. */
export const BACKOFF_BASE_MS = 60 * 1000;
export const BACKOFF_CAP_MS = 30 * 60 * 1000;
/** A claimed job that never reported back is reclaimable after this long. */
export const LEASE_MS = 10 * 60 * 1000;
/**
 * CLAIMED belongs here: if a runner dies mid-upload its row must come back after
 * the lease, otherwise one crash parks that video forever.
 */
export const CLAIMABLE_STATUSES = ["PENDING", "CLAIMED", "FAILED"] as const;

/**
 * A job whose publish id may already carry the video, and whose status query
 * failed. It is deliberately NOT claimable: claiming it would re-upload and put
 * a second copy in the creator's inbox. It can only be reconciled, which is a
 * status read, never an upload.
 */
export const RECONCILE_STATUS = "NEEDS_RECONCILIATION" as const;

/**
 * Exponential backoff with a ceiling. Attempt 1 waits a minute, attempt 5 waits
 * sixteen, and nothing ever waits longer than the cap.
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
}

export function nextAttemptFor(attempts: number, now: number): Date {
  return new Date(now + backoffMs(attempts));
}

/**
 * The retry decision, kept pure so it can be asserted without a database.
 * `null` means "retry now", a Date means "wait", and DEAD means "stop".
 */
export function retryDecision(
  attempts: number,
  now: number
): { status: "FAILED" | "DEAD"; nextAttemptAt: Date | null } {
  if (attempts >= MAX_ATTEMPTS) {
    return { status: "DEAD", nextAttemptAt: null };
  }
  return { status: "FAILED", nextAttemptAt: nextAttemptFor(attempts, now) };
}

/**
 * What a reconciliation answer means. Pure, so the three outcomes can be
 * asserted without a database or a network call.
 */
export function reconciliationDecision(
  outcome: "settled" | "failed" | "unknown",
  attempts: number,
  now: number
): {
  status: "UPLOADED" | "PENDING" | "DEAD" | typeof RECONCILE_STATUS;
  nextAttemptAt: Date | null;
} {
  if (outcome === "settled") {
    return { status: "UPLOADED", nextAttemptAt: null };
  }
  if (outcome === "failed") {
    // TikTok says this publish id failed, so a fresh upload cannot duplicate.
    if (attempts >= MAX_ATTEMPTS) {
      return { status: "DEAD", nextAttemptAt: null };
    }
    return { status: "PENDING", nextAttemptAt: new Date(now) };
  }
  // Still unknown: wait, stay held, and never upload.
  return { status: RECONCILE_STATUS, nextAttemptAt: nextAttemptFor(attempts, now) };
}

export function leaseExpiry(now: number): Date {
  return new Date(now - LEASE_MS);
}

export function isClaimable(
  job: { status: string; attempts: number; claimedAt: Date | null },
  now: number
): boolean {
  if (job.attempts >= MAX_ATTEMPTS) {
    return false;
  }
  if (!(CLAIMABLE_STATUSES as readonly string[]).includes(job.status)) {
    return false;
  }
  if (job.claimedAt === null) {
    return true;
  }
  // Claimed but silent, or failed: only after the lease has lapsed.
  return job.claimedAt.getTime() < now - LEASE_MS;
}

export interface EnqueueInput {
  organizationId: string;
  userId: string;
  jobKey: string;
  mediaUrl: string;
  caption?: string | null;
}

/**
 * Idempotent on (organizationId, jobKey): asking twice returns the row that
 * already exists, including when it is already uploaded.
 */
export async function enqueueJob(input: EnqueueInput) {
  await db
    .insert(tiktokPublishJob)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      jobKey: input.jobKey,
      mediaUrl: input.mediaUrl,
      caption: input.caption ?? null,
    })
    .onConflictDoNothing({
      target: [tiktokPublishJob.organizationId, tiktokPublishJob.jobKey],
    });
  const [row] = await db
    .select()
    .from(tiktokPublishJob)
    .where(
      and(
        eq(tiktokPublishJob.organizationId, input.organizationId),
        eq(tiktokPublishJob.jobKey, input.jobKey)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function claimDueJobs(
  organizationId: string,
  limit: number,
  now: number = Date.now(),
  handle: typeof db = db
) {
  const leaseBefore = leaseExpiry(now);
  const candidates = await handle
    .select({ id: tiktokPublishJob.id })
    .from(tiktokPublishJob)
    .where(
      and(
        eq(tiktokPublishJob.organizationId, organizationId),
        inArray(tiktokPublishJob.status, [...CLAIMABLE_STATUSES]),
        lt(tiktokPublishJob.attempts, MAX_ATTEMPTS),
        or(
          isNull(tiktokPublishJob.claimedAt),
          lt(tiktokPublishJob.claimedAt, leaseBefore)
        ),
        or(
          isNull(tiktokPublishJob.nextAttemptAt),
          lte(tiktokPublishJob.nextAttemptAt, new Date(now))
        )
      )
    )
    .orderBy(asc(tiktokPublishJob.createdAt))
    .limit(Math.max(1, Math.min(limit, 20)));

  if (candidates.length === 0) {
    return [];
  }
  // The status predicate repeats in the UPDATE: a second runner that read the
  // same rows finds them already CLAIMED and updates nothing.
  return handle
    .update(tiktokPublishJob)
    .set({
      status: "CLAIMED",
      claimedAt: new Date(now),
      lastAttemptAt: new Date(now),
      attempts: sql`${tiktokPublishJob.attempts} + 1`,
      updatedAt: new Date(now),
    })
    .where(
      and(
        inArray(
          tiktokPublishJob.id,
          candidates.map((row) => row.id)
        ),
        inArray(tiktokPublishJob.status, [...CLAIMABLE_STATUSES])
      )
    )
    .returning();
}

export async function finishJob(params: {
  id: string;
  status: "UPLOADED" | "FAILED" | "DEAD";
  publishId?: string | null;
  lastError?: string | null;
  attempts: number;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const failed = params.status !== "UPLOADED";
  const decision = failed ? retryDecision(params.attempts, now) : null;
  const status = decision ? decision.status : params.status;

  await db
    .update(tiktokPublishJob)
    .set({
      status,
      publishId: params.publishId ?? null,
      lastError: params.lastError ? params.lastError.slice(0, 300) : null,
      nextAttemptAt: decision ? decision.nextAttemptAt : null,
      deadAt: status === "DEAD" ? new Date(now) : null,
      updatedAt: new Date(now),
    })
    .where(eq(tiktokPublishJob.id, params.id));

  return status;
}

/** One audit row per state change. Never throws into the publishing path. */
export async function recordEvent(params: {
  jobId: string;
  organizationId: string;
  userId: string;
  type:
    | "enqueued"
    | "claimed"
    | "uploaded"
    | "failed"
    | "retry_scheduled"
    | "dead_lettered"
    | "reconciled"
    | "not_connected";
  detail?: string | null;
}) {
  try {
    await db.insert(tiktokPublishEvent).values({
      jobId: params.jobId,
      organizationId: params.organizationId,
      userId: params.userId,
      type: params.type,
      detail: params.detail ? params.detail.slice(0, 300) : null,
    });
  } catch {
    // An audit write must never turn a successful upload into a failure.
  }
}

export async function listEvents(organizationId: string, jobId: string) {
  return db
    .select()
    .from(tiktokPublishEvent)
    .where(
      and(
        eq(tiktokPublishEvent.organizationId, organizationId),
        eq(tiktokPublishEvent.jobId, jobId)
      )
    )
    .orderBy(asc(tiktokPublishEvent.createdAt));
}

export async function listJobs(
  organizationId: string,
  userId: string,
  limit = 20
) {
  return db
    .select()
    .from(tiktokPublishJob)
    .where(
      and(
        eq(tiktokPublishJob.organizationId, organizationId),
        eq(tiktokPublishJob.userId, userId)
      )
    )
    .orderBy(asc(tiktokPublishJob.createdAt))
    .limit(Math.max(1, Math.min(limit, 50)));
}

/**
 * Organizations that currently have work, for the tenant-agnostic coordinator.
 *
 * This is the one cross-tenant read in the module, and it returns organization
 * ids only: no job content, no tokens, no user data. Every subsequent operation
 * runs inside that organization's own tenant transaction, so RLS still decides
 * what each tenant can touch. It exists so a scheduler does not have to be
 * configured with a fixed organization id.
 */
export async function listTenantsWithDueWork(
  limit = 20,
  now: number = Date.now(),
  handle: typeof db = adminDb() as unknown as typeof db
): Promise<string[]> {
  const leaseBefore = leaseExpiry(now);
  const rows = await handle
    .selectDistinct({ organizationId: tiktokPublishJob.organizationId })
    .from(tiktokPublishJob)
    .where(
      and(
        or(
          isNull(tiktokPublishJob.claimedAt),
          lt(tiktokPublishJob.claimedAt, leaseBefore)
        ),
        or(
          isNull(tiktokPublishJob.nextAttemptAt),
          lte(tiktokPublishJob.nextAttemptAt, new Date(now))
        ),
        or(
          and(
            inArray(tiktokPublishJob.status, [...CLAIMABLE_STATUSES]),
            lt(tiktokPublishJob.attempts, MAX_ATTEMPTS)
          ),
          eq(tiktokPublishJob.status, RECONCILE_STATUS)
        )
      )
    )
    .limit(Math.max(1, Math.min(limit, 50)));
  return rows.map((row) => row.organizationId);
}

/**
 * Claims jobs that are waiting on a reconciliation answer. Claims with a lease
 * and does NOT increment attempts: asking TikTok what happened is not a publish
 * attempt, so it must not consume the retry budget.
 */
export async function claimReconcileJobs(
  organizationId: string,
  limit: number,
  now: number = Date.now(),
  handle: typeof db = db
) {
  const leaseBefore = leaseExpiry(now);
  const free = or(
    isNull(tiktokPublishJob.claimedAt),
    lt(tiktokPublishJob.claimedAt, leaseBefore)
  );
  const candidates = await handle
    .select({ id: tiktokPublishJob.id })
    .from(tiktokPublishJob)
    .where(
      and(
        eq(tiktokPublishJob.organizationId, organizationId),
        eq(tiktokPublishJob.status, RECONCILE_STATUS),
        free
      )
    )
    .orderBy(asc(tiktokPublishJob.createdAt))
    .limit(Math.max(1, Math.min(limit, 20)));

  if (candidates.length === 0) {
    return [];
  }
  return handle
    .update(tiktokPublishJob)
    .set({ claimedAt: new Date(now), lastAttemptAt: new Date(now), updatedAt: new Date(now) })
    .where(
      and(
        inArray(
          tiktokPublishJob.id,
          candidates.map((row) => row.id)
        ),
        eq(tiktokPublishJob.status, RECONCILE_STATUS),
        free
      )
    )
    .returning();
}

/** Applies a reconciliation answer, or holds the job when the answer is unknown. */
export async function applyReconciliation(params: {
  id: string;
  outcome: "settled" | "failed" | "unknown";
  attempts: number;
  publishId: string | null;
  detail?: string | null;
  now?: number;
  handle?: typeof db;
}) {
  const now = params.now ?? Date.now();
  const decision = reconciliationDecision(params.outcome, params.attempts, now);
  await (params.handle ?? db)
    .update(tiktokPublishJob)
    .set({
      status: decision.status,
      claimedAt: null,
      nextAttemptAt: decision.nextAttemptAt,
      lastError: params.detail ? params.detail.slice(0, 300) : null,
      deadAt: decision.status === "DEAD" ? new Date(now) : null,
      updatedAt: new Date(now),
    })
    .where(eq(tiktokPublishJob.id, params.id));
  return decision.status;
}
