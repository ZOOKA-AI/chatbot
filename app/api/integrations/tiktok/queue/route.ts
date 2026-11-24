import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { checkMediaUrl } from "@/lib/integrations/tiktok/media";
import { enqueueJob, listJobs } from "@/lib/integrations/tiktok/queue";

/**
 * Queues one video for the creator who asked for it.
 *
 * The row is the only thing n8n sees: no token, no signed URL, nothing reusable
 * by anyone else. Queueing does not upload, so a wrong entry can be corrected
 * before any bytes leave the server.
 */
async function POSTImpl(request: Request) {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(String(context.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { mediaUrl?: unknown; caption?: unknown; jobKey?: unknown }
    | null;
  if (!body || typeof body.mediaUrl !== "string") {
    return NextResponse.json({ error: "mediaUrl_required" }, { status: 400 });
  }
  const media = checkMediaUrl(body.mediaUrl);
  if (!media.ok) {
    return NextResponse.json(
      { error: media.problem ?? "invalid_media_url" },
      { status: 400 }
    );
  }
  const caption =
    typeof body.caption === "string" ? body.caption.slice(0, 2200) : null;
  const jobKey =
    typeof body.jobKey === "string" && body.jobKey.trim().length > 0
      ? body.jobKey.trim().slice(0, 128)
      : randomUUID();

  let job: Awaited<ReturnType<typeof enqueueJob>>;
  try {
    job = await enqueueJob({
      organizationId: context.organizationId,
      userId: context.user.id,
      jobKey,
      mediaUrl: body.mediaUrl,
      caption,
    });
  } catch {
    // Same refusal the n8n drain route gives. A queue that is not there (tables
    // not migrated, database unreachable) used to escape as an empty 500, which
    // reads like a code fault and gives the caller nothing to branch on.
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
  if (!job) {
    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }
  return NextResponse.json({
    job: {
      id: job.id,
      jobKey: job.jobKey,
      status: job.status,
      attempts: job.attempts,
      publishId: job.publishId,
      createdAt: job.createdAt,
    },
    nextStep:
      "The queue is drained by the publishing workflow. Nothing is posted until a runner uploads it, and the creator still finishes the post inside TikTok.",
  });
}

async function GETImpl() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const jobs = await listJobs(context.organizationId, context.user.id, 20);
    return NextResponse.json({ jobs, scope: "user" });
  } catch {
    // The list is a read: an unavailable queue must answer 503 like the drain
    // route, not an empty 500 with no body for the UI to interpret.
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
}

export const POST = withRequestTenantHandler(POSTImpl);
export const GET = withRequestTenantHandler(GETImpl);
