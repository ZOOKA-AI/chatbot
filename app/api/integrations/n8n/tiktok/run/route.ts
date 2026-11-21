import { NextResponse } from "next/server";
import { runInTenantTransaction } from "@/lib/db/tenant-client";
import { fetchPublishStatus, initInboxUpload, putChunk } from "@/lib/integrations/tiktok/api";
import { fetchMedia } from "@/lib/integrations/tiktok/media";
import {
  applyReconciliation,
  claimDueJobs,
  claimReconcileJobs,
  finishJob,
  listTenantsWithDueWork,
  MAX_ATTEMPTS,
  rateLimitDelayMs,
  RECONCILE_STATUS,
  recordEvent,
  releaseForRateLimit,
} from "@/lib/integrations/tiktok/queue";
import {
  getTiktokAccess,
  recordUpload,
  updateUploadStatus,
} from "@/lib/integrations/tiktok/store";
import {
  checkTiktokMedia,
  planTiktokChunks,
  tiktokChunkRanges,
} from "@/lib/integrations/tiktok/validate";
import { verifySharedSecret } from "@/lib/webhooks/security";

/**
 * The drain endpoint the n8n scheduler calls.
 *
 * Why this shape: n8n must never hold a creator's access token. The token is
 * encrypted per user in TikTokConnection and only this process can decrypt it,
 * so n8n posts an organization id and the server uploads with each owner's own
 * token. The shared secret is the only credential n8n holds, and it grants
 * nothing beyond "drain this workspace's queue".
 *
 * Reliability rules enforced here:
 *  - a job is claimed with a lease before any network call, so a crash leaves a
 *    reclaimable row instead of an endless retry;
 *  - a retried job whose previous attempt already reached TikTok is reconciled
 *    by asking TikTok, never re-uploaded blind: a second upload would put two
 *    copies of the same video in somebody's inbox;
 *  - failures schedule an exponential backoff, and the attempt cap moves the job
 *    to a dead-letter state instead of retrying forever.
 */

/** TikTok states that mean "this publish id already carries our video". */
const SETTLED_STATUSES = new Set([
  "PUBLISH_COMPLETE",
  "SEND_TO_USER_INBOX",
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
]);

type JobResult = {
  id: string;
  status: "UPLOADED" | "FAILED" | "DEAD" | "RECONCILED" | "NEEDS_RECONCILIATION";
  publishId?: string | null;
  error?: string | null;
  attempts: number;
  retryable: boolean;
};

export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "n8n_webhook_secret_not_configured" },
      { status: 500 }
    );
  }
  if (!verifySharedSecret(request.headers.get("x-n8n-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: unknown; limit?: unknown }
    | null;
  // Tenant-agnostic by design: the scheduler is not configured with an
  // organization id. With none supplied, the server finds the tenants that have
  // due work and opens a separate tenant transaction for each. An explicit id is
  // still accepted, and is validated the same way.
  const requested =
    typeof body?.organizationId === "string" ? body.organizationId : null;
  if (requested && !/^[0-9a-f-]{36}$/i.test(requested)) {
    return NextResponse.json({ error: "organizationId_malformed" }, { status: 400 });
  }
  const limit = typeof body?.limit === "number" ? body.limit : 5;
  let tenants: string[];
  if (requested) {
    tenants = [requested];
  } else {
    try {
      tenants = await listTenantsWithDueWork(
        typeof body?.limit === "number" ? limit : 20
      );
    } catch {
      // A scheduler retrying an unavailable database must see a clean refusal,
      // not a stack trace that reads like a code fault.
      return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
    }
  }
  if (tenants.length === 0) {
    return NextResponse.json({ tenants: 0, claimed: 0, results: [], note: "no_due_work" });
  }

  const results: JobResult[] = [];
  for (const organizationId of tenants) {
    const drained = await drainTenant(organizationId, limit);
    results.push(...drained);
  }
  return NextResponse.json({
    tenants: tenants.length,
    claimed: results.length,
    results,
    note: "An UPLOADED job is in the creator's TikTok inbox, not published. The creator finishes the post inside TikTok.",
  });
}

/**
 * One tenant, one transaction scope. Reconciliation runs before new work so a
 * held job is resolved rather than left behind, and it only ever reads status.
 */
async function drainTenant(organizationId: string, limit: number): Promise<JobResult[]> {
  const inTenant = <T>(work: () => Promise<T>) =>
    runInTenantTransaction({ organizationId, userId: null }, work);
  const results: JobResult[] = [];

  const held = await inTenant(() => claimReconcileJobs(organizationId, limit));
  for (const job of held) {
    const access = await getTiktokAccess(organizationId, job.userId);
    if (!access) {
      await inTenant(() =>
        applyReconciliation({
          id: job.id,
          outcome: "unknown",
          attempts: job.attempts,
          publishId: job.publishId,
          detail: "not_connected_during_reconciliation",
        })
      );
      results.push({
        id: job.id,
        status: RECONCILE_STATUS,
        publishId: job.publishId,
        attempts: job.attempts,
        retryable: false,
      });
      continue;
    }
    const known = job.publishId
      ? await fetchPublishStatus(access.accessToken, job.publishId)
      : { ok: false as const, error: "no_publish_id" };
    const outcome = !known.ok
      ? ("unknown" as const)
      : SETTLED_STATUSES.has(known.value.status)
        ? ("settled" as const)
        : ("failed" as const);
    const status = await inTenant(() =>
      applyReconciliation({
        id: job.id,
        outcome,
        attempts: job.attempts,
        publishId: job.publishId,
        detail: known.ok ? `tiktok reports ${known.value.status}` : known.error,
      })
    );
    await inTenant(() =>
      recordEvent({
        jobId: job.id,
        organizationId,
        userId: job.userId,
        type: "reconciled",
        detail: known.ok ? known.value.status : known.error,
      })
    );
    results.push({
      id: job.id,
      status:
        status === "UPLOADED"
          ? "RECONCILED"
          : status === "DEAD"
            ? "DEAD"
            : status === "PENDING"
              ? "FAILED"
              : RECONCILE_STATUS,
      publishId: job.publishId,
      attempts: job.attempts,
      retryable: status === "PENDING",
    });
  }

  const jobs = await inTenant(() => claimDueJobs(organizationId, limit));
  let throttled = false;

  for (const job of jobs) {
    await inTenant(() =>
      recordEvent({
        jobId: job.id,
        organizationId,
        userId: job.userId,
        type: "claimed",
        detail: `attempt ${job.attempts}`,
      })
    );

    const fail = async (
      error: string,
      extra: {
        retryable: boolean;
        publishId?: string | null;
        retryAfterMs?: number;
      }
    ): Promise<JobResult> => {
      // A 429 belongs to the account's quota, not to this video. Parking it with
      // the platform's own Retry-After keeps the attempt counter honest and
      // stops this run from hammering an endpoint that already said no.
      if (error === "rate_limited") {
        const delayMs = extra.retryAfterMs ?? rateLimitDelayMs(null);
        await inTenant(() =>
          releaseForRateLimit({
            id: job.id,
            delayMs,
            lastError: `rate_limited_${delayMs}ms`,
          })
        );
        await inTenant(() =>
          recordEvent({
            jobId: job.id,
            organizationId,
            userId: job.userId,
            type: "rate_limited",
            detail: `parked ${delayMs}ms`,
          })
        );
        throttled = true;
        return {
          id: job.id,
          status: "FAILED",
          publishId: extra.publishId ?? job.publishId,
          error: "rate_limited",
          attempts: job.attempts,
          retryable: true,
        };
      }
      const status = await inTenant(() =>
        finishJob({
          id: job.id,
          status: "FAILED",
          lastError: error,
          publishId: extra.publishId ?? job.publishId,
          attempts: job.attempts,
        })
      );
      await inTenant(() =>
        recordEvent({
          jobId: job.id,
          organizationId,
          userId: job.userId,
          type: status === "DEAD" ? "dead_lettered" : "retry_scheduled",
          detail: error,
        })
      );
      return {
        id: job.id,
        status: status === "DEAD" ? "DEAD" : "FAILED",
        publishId: extra.publishId ?? job.publishId,
        error,
        attempts: job.attempts,
        retryable: extra.retryable && job.attempts < MAX_ATTEMPTS,
      };
    };

    const access = await getTiktokAccess(organizationId, job.userId);
    if (!access) {
      await inTenant(() =>
        recordEvent({
          jobId: job.id,
          organizationId,
          userId: job.userId,
          type: "not_connected",
        })
      );
      results.push(await fail("not_connected_or_refresh_failed", { retryable: true }));
      continue;
    }

    // Reconcile before retrying. A previous attempt may have reached TikTok and
    // died on our side; uploading again would duplicate the video.
    if (job.publishId && job.attempts > 1) {
      const known = await fetchPublishStatus(access.accessToken, job.publishId);
      if (known.ok && SETTLED_STATUSES.has(known.value.status)) {
        await inTenant(() =>
          finishJob({
            id: job.id,
            status: "UPLOADED",
            publishId: job.publishId,
            attempts: job.attempts,
          })
        );
        await inTenant(() =>
          recordEvent({
            jobId: job.id,
            organizationId,
            userId: job.userId,
            type: "reconciled",
            detail: `tiktok reports ${known.value.status}`,
          })
        );
        results.push({
          id: job.id,
          status: "RECONCILED",
          publishId: job.publishId,
          attempts: job.attempts,
          retryable: false,
        });
        continue;
      }
      if (!known.ok && known.error === "rate_limited") {
        results.push(
          await fail("rate_limited", {
            retryable: true,
            publishId: job.publishId,
            retryAfterMs: known.retryAfterMs,
          })
        );
        continue;
      }
      if (!known.ok) {
        // TikTok did not answer, so the outcome is genuinely unknown. Holding the
        // job is the only safe move: it leaves the claimable set entirely, so no
        // runner can pick it up and re-upload while the answer is missing.
        await inTenant(() =>
          applyReconciliation({
            id: job.id,
            outcome: "unknown",
            attempts: job.attempts,
            publishId: job.publishId,
            detail: `reconcile_failed_${known.error}`,
          })
        );
        await inTenant(() =>
          recordEvent({
            jobId: job.id,
            organizationId,
            userId: job.userId,
            type: "reconciled",
            detail: `held: unknown outcome (${known.error})`,
          })
        );
        results.push({
          id: job.id,
          status: RECONCILE_STATUS,
          publishId: job.publishId,
          attempts: job.attempts,
          retryable: false,
        });
        continue;
      }
      // TikTok says the old publish id failed: a fresh upload is safe.
    }

    const media = await fetchMedia(job.mediaUrl);
    if (!media.ok) {
      results.push(await fail(media.error, { retryable: true }));
      continue;
    }

    const shape = checkTiktokMedia({
      size: media.value.bytes.byteLength,
      mime: media.value.mime,
    });
    if (!shape.ok) {
      results.push(
        await fail(shape.problem ?? "invalid_media", { retryable: false })
      );
      continue;
    }

    const size = media.value.bytes.byteLength;
    const plan = planTiktokChunks(size);
    const ticket = await initInboxUpload(access.accessToken, {
      size,
      chunkSize: plan.chunkSize,
      totalChunkCount: plan.totalChunkCount,
    });
    if (!ticket.ok) {
      results.push(
        await fail(ticket.error, {
          retryable: true,
          retryAfterMs: ticket.retryAfterMs,
        })
      );
      continue;
    }

    await inTenant(() =>
      recordUpload({
        organizationId,
        userId: job.userId,
        publishId: ticket.value.publishId,
        fileName: job.jobKey,
        fileSize: size,
        mimeType: media.value.mime,
        status: "INIT",
      })
    );

    let failure: string | null = null;
    let failureRetryAfter: number | undefined;
    let sentTo = 0;
    for (const range of tiktokChunkRanges(size, plan)) {
      const chunk = media.value.bytes.subarray(range.start, range.end + 1);
      const sent = await putChunk(ticket.value.uploadUrl, chunk, range, size);
      if (!sent.ok) {
        failure = sent.error.slice(0, 200);
        failureRetryAfter = sent.retryAfterMs;
        break;
      }
      sentTo = range.end + 1;
    }

    await inTenant(() =>
      updateUploadStatus({
        organizationId,
        userId: job.userId,
        publishId: ticket.value.publishId,
        status: failure ? "FAILED" : "UPLOADED",
        failReason: failure,
        uploadedBytes: sentTo,
      })
    );

    if (failure) {
      results.push(
        await fail(failure, {
          retryable: true,
          publishId: ticket.value.publishId,
          retryAfterMs: failureRetryAfter,
        })
      );
      continue;
    }

    await inTenant(() =>
      finishJob({
        id: job.id,
        status: "UPLOADED",
        publishId: ticket.value.publishId,
        attempts: job.attempts,
      })
    );
    await inTenant(() =>
      recordEvent({
        jobId: job.id,
        organizationId,
        userId: job.userId,
        type: "uploaded",
        detail: ticket.value.publishId,
      })
    );
    results.push({
      id: job.id,
      status: "UPLOADED",
      publishId: ticket.value.publishId,
      attempts: job.attempts,
      retryable: false,
    });
    if (throttled) {
      // The workspace is over its posting rate. Leave the rest of the batch
      // claimed-but-untouched for the next run rather than draining into a 429.
      break;
    }
  }

  return results;
}
