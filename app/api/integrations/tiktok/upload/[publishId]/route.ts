import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { fetchPublishStatus } from "@/lib/integrations/tiktok/api";
import {
  getTiktokAccess,
  updateUploadStatus,
} from "@/lib/integrations/tiktok/store";

/**
 * Status of one upload, read from TikTok and then recorded.
 * A publish id belonging to somebody else is simply not found here.
 */
async function GETImpl(
  _request: Request,
  { params }: { params: Promise<{ publishId: string }> }
) {
  const { publishId } = await params;
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!/^[A-Za-z0-9._-]{4,128}$/.test(publishId)) {
    return NextResponse.json({ error: "invalid_publish_id" }, { status: 400 });
  }
  const access = await getTiktokAccess(context.organizationId, context.user.id);
  if (!access) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }
  const status = await fetchPublishStatus(access.accessToken, publishId);
  if (!status.ok) {
    return NextResponse.json(
      { error: status.error, detail: status.detail },
      { status: 502 }
    );
  }
  await updateUploadStatus({
    organizationId: context.organizationId,
    userId: context.user.id,
    publishId,
    status: status.value.status,
    failReason: status.value.failReason?.slice(0, 200) ?? null,
    uploadedBytes: status.value.uploadedBytes,
  });
  return NextResponse.json({ publishId, ...status.value });
}

export const GET = withRequestTenantHandler(GETImpl);
