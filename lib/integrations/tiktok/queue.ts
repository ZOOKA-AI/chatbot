import "server-only";

import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { tiktokPublishJob } from "@/lib/db/schema";

/**
 * The handoff between n8n and the creator's token.
 *
 * n8n schedules; it never sees a token. A job row is the contract: whoever holds
 * the job key can ask for the upload, and the unique key makes a retried request
 * a no-op instead of a second video in someone's inbox.
 */

export const MAX_ATTEMPTS = 3;
/** A claimed job that never reported back is reclaimable after this long. */
export const LEASE_MS = 10 * 60 * 1000;
/**
 * CLAIMED belongs here: if a runner dies mid-upload its row must come back after
 * the lease, otherwise one crash parks that video forever.
 */
export const CLAIMABLE_STATUSES = ["PENDING", "CLAIMED", "FAILED"] as const;

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
  now: number = Date.now()
) {
  const leaseBefore = leaseExpiry(now);
  const candidates = await db
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
  return db
    .update(tiktokPublishJob)
    .set({
      status: "CLAIMED",
      claimedAt: new Date(now),
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
  status: "UPLOADED" | "FAILED";
  publishId?: string | null;
  lastError?: string | null;
}) {
  await db
    .update(tiktokPublishJob)
    .set({
      status: params.status,
      publishId: params.publishId ?? null,
      lastError: params.lastError ? params.lastError.slice(0, 300) : null,
      updatedAt: new Date(),
    })
    .where(eq(tiktokPublishJob.id, params.id));
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
