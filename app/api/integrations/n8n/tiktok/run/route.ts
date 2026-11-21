import { NextResponse } from "next/server";
import { runInTenantTransaction } from "@/lib/db/tenant-client";
import {
  initInboxUpload,
  putChunk,
} from "@/lib/integrations/tiktok/api";
import { fetchMedia } from "@/lib/integrations/tiktok/media";
import { claimDueJobs, finishJob, MAX_ATTEMPTS } from "@/lib/integrations/tiktok/queue";
import { getTiktokAccess, recordUpload, updateUploadStatus } from "@/lib/integrations/tiktok/store";
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
 * Every job is claimed with a lease before any network call, so a crash leaves a
 * reclaimable row rather than an endless retry, and the job key makes a repeated
 * call a no-op instead of a second video in someone's inbox.
 */
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

  const jobs = await runInTenantTransaction(
    { organizationId, userId: null },
    () => claimDueJobs(organizationId, limit)
  );

  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const access = await getTiktokAccess(organizationId, job.userId);
    if (!access) {
      await runInTenantTransaction({ organizationId, userId: null }, () =>
        finishJob({
          id: job.id,
          status: "FAILED",
          lastError: "not_connected_or_refresh_failed",
        })
      );
      results.push({
        id: job.id,
        status: "FAILED",
        error: "not_connected_or_refresh_failed",
        attempts: job.attempts,
        retryable: job.attempts < MAX_ATTEMPTS,
      });
      continue;
    }

    const media = await fetchMedia(job.mediaUrl);
    if (!media.ok) {
      await runInTenantTransaction({ organizationId, userId: null }, () =>
        finishJob({ id: job.id, status: "FAILED", lastError: media.error })
      );
      results.push({
        id: job.id,
        status: "FAILED",
        error: media.error,
        attempts: job.attempts,
        retryable: job.attempts < MAX_ATTEMPTS,
      });
      continue;
    }

    const shape = checkTiktokMedia({
      size: media.value.bytes.byteLength,
      mime: media.value.mime,
    });
    if (!shape.ok) {
      await runInTenantTransaction({ organizationId, userId: null }, () =>
        finishJob({ id: job.id, status: "FAILED", lastError: shape.problem })
      );
      results.push({
        id: job.id,
        status: "FAILED",
        error: shape.problem,
        attempts: job.attempts,
        retryable: false,
      });
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
      await runInTenantTransaction({ organizationId, userId: null }, () =>
        finishJob({ id: job.id, status: "FAILED", lastError: ticket.error })
      );
      results.push({
        id: job.id,
        status: "FAILED",
        error: ticket.error,
        attempts: job.attempts,
        retryable: job.attempts < MAX_ATTEMPTS,
      });
      continue;
    }

    await recordUpload({
      organizationId,
      userId: job.userId,
      publishId: ticket.value.publishId,
      fileName: job.jobKey,
      fileSize: size,
      mimeType: media.value.mime,
      status: "INIT",
    });

    let failure: string | null = null;
    let sentTo = 0;
    for (const range of tiktokChunkRanges(size, plan)) {
      const chunk = media.value.bytes.subarray(range.start, range.end + 1);
      const sent = await putChunk(
        ticket.value.uploadUrl,
        chunk,
        range,
        size
      );
      if (!sent.ok) {
        failure = sent.error.slice(0, 200);
        break;
      }
      sentTo = range.end + 1;
    }

    await runInTenantTransaction({ organizationId, userId: null }, () =>
      updateUploadStatus({
        organizationId,
        userId: job.userId,
        publishId: ticket.value.publishId,
        status: failure ? "FAILED" : "UPLOADED",
        failReason: failure,
        uploadedBytes: sentTo,
      })
    );
    await runInTenantTransaction({ organizationId, userId: null }, () =>
      finishJob({
        id: job.id,
        status: failure ? "FAILED" : "UPLOADED",
        publishId: ticket.value.publishId,
        lastError: failure,
      })
    );

    results.push({
      id: job.id,
      status: failure ? "FAILED" : "UPLOADED",
      publishId: ticket.value.publishId,
      error: failure,
      attempts: job.attempts,
      retryable: failure !== null && job.attempts < MAX_ATTEMPTS,
      chunks: plan.totalChunkCount,
    });
  }

  return NextResponse.json({
    claimed: jobs.length,
    results,
    note: "An UPLOADED job is in the creator's TikTok inbox, not published. The creator finishes the post inside TikTok.",
  });
}
