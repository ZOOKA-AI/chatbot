import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  initInboxUpload,
  putChunk,
} from "@/lib/integrations/tiktok/api";
import {
  getTiktokAccess,
  recordUpload,
  updateUploadStatus,
} from "@/lib/integrations/tiktok/store";
import {
  checkTiktokMedia,
  planTiktokChunks,
  TIKTOK_MAX_UPLOAD_BYTES,
  tiktokChunkRanges,
} from "@/lib/integrations/tiktok/validate";

/**
 * Uploads one video into the caller's own TikTok inbox.
 *
 * Nothing is published: the Content Posting API places the file in the
 * creator's inbox and the creator finishes the post inside TikTok. The token
 * used is the caller's own; there is no fallback to any other connection.
 */
async function POSTImpl(request: Request) {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(String(context.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > TIKTOK_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        detail: `Our per-upload cap is ${Math.round(
          TIKTOK_MAX_UPLOAD_BYTES / (1024 * 1024)
        )}MB.`,
      },
      { status: 413 }
    );
  }
  const media = checkTiktokMedia({ size: file.size, mime: file.type });
  if (!media.ok) {
    return NextResponse.json(
      { error: media.problem, detail: media.detail },
      { status: 400 }
    );
  }

  const access = await getTiktokAccess(context.organizationId, context.user.id);
  if (!access) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  const plan = planTiktokChunks(file.size);
  const ticket = await initInboxUpload(access.accessToken, {
    size: file.size,
    chunkSize: plan.chunkSize,
    totalChunkCount: plan.totalChunkCount,
  });
  if (!ticket.ok) {
    return NextResponse.json(
      { error: ticket.error, detail: ticket.detail },
      { status: 502 }
    );
  }

  await recordUpload({
    organizationId: context.organizationId,
    userId: context.user.id,
    publishId: ticket.value.publishId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    status: "INIT",
  });

  const bytes = Buffer.from(await file.arrayBuffer());
  const ranges = tiktokChunkRanges(file.size, plan);
  for (const range of ranges) {
    const chunk = bytes.subarray(range.start, range.end + 1);
    const sent = await putChunk(
      ticket.value.uploadUrl,
      chunk,
      range,
      file.size
    );
    if (!sent.ok) {
      await updateUploadStatus({
        organizationId: context.organizationId,
        userId: context.user.id,
        publishId: ticket.value.publishId,
        status: "FAILED",
        failReason: sent.error.slice(0, 200),
        uploadedBytes: range.start,
      });
      return NextResponse.json(
        {
          error: "upload_failed",
          detail: sent.error,
          publishId: ticket.value.publishId,
        },
        { status: 502 }
      );
    }
  }

  await updateUploadStatus({
    organizationId: context.organizationId,
    userId: context.user.id,
    publishId: ticket.value.publishId,
    status: "UPLOADED",
    failReason: null,
    uploadedBytes: file.size,
  });

  return NextResponse.json({
    publishId: ticket.value.publishId,
    status: "UPLOADED",
    fileName: file.name,
    fileSize: file.size,
    chunks: ranges.length,
    nextStep:
      "The video is now in your TikTok inbox. Open TikTok and finish the post there; nothing is published by ZOOKA-AI.",
  });
}

export const POST = withRequestTenantHandler(POSTImpl);
