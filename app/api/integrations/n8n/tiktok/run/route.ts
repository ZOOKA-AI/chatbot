import { NextResponse } from "next/server";
import { runInTenantTransaction } from "@/lib/db/tenant-client";
import { fetchPublishStatus, initInboxUpload, putChunk } from "@/lib/integrations/tiktok/api";
import { fetchMedia } from "@/lib/integrations/tiktok/media";
import {
  claimDueJobs,
  finishJob,
  MAX_ATTEMPTS,
  recordEvent,
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
  status: "UPLOADED" | "FAILED" | "DEAD" | "RECONCILED";
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
  const organizationId =
    typeof body?.organizationId === "string" ? body.organizationId : null;
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return NextResponse.json({ error: "organizationId_required" }, { status: 400 });
  }
  const limit = typeof body?.limit === "number" ? body.limit : 5;

  const inTenant = <T>(work: () => Promise<T>) =>
    runInTenantTransaction({ organizationId, userId: null }, work);

  const jobs = await inTenant(() => claimDueJobs(organizationId, limit));
  const results: JobResult[] = [];

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
      extra: { retryable: boolean; publishId?: string | null }
    ): Promise<JobResult> => {
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
      if (!known.ok) {
        // TikTok did not answer, so the outcome is genuinely unknown. Retrying
        // now would be the blind republish the rule forbids.
        results.push(
          await fail(`reconcile_failed_${known.error}`, {
            retryable: true,
            publishId: job.publishId,
          })
        );
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
      results.push(await fail(ticket.error, { retryable: true }));
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
    let sentTo = 0;
    for (const range of tiktokChunkRanges(size, plan)) {
      const chunk = media.value.bytes.subarray(range.start, range.end + 1);
      const sent = await putChunk(ticket.value.uploadUrl, chunk, range, size);
      if (!sent.ok) {
        failure = sent.error.slice(0, 200);
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
        await fail(failure, { retryable: true, publishId: ticket.value.publishId })
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
  }

  return NextResponse.json({
    claimed: jobs.length,
    results,
    note: "An UPLOADED job is in the creator's TikTok inbox, not published. The creator finishes the post inside TikTok.",
  });
}
