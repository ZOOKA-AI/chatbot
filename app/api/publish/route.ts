import { NextResponse } from "next/server";
import { verifyMcpKey, touchMcpKey } from "@/lib/db/mcp-keys";
import { enqueuePublish, listRecentPublishes, settlePublish } from "@/lib/db/publish-queue";
import { dispatchPublish } from "@/lib/publish/dispatch";

/**
 * نقطة نشر خاصة تستدعيها n8n. المصادقة بمفتاح المساحة نفسه (Bearer)،
 * والتكرار محكوم بـ externalId، وفشل المزوّد يُحفظ لا يُخفى.
 */

const CHANNELS = new Set(["facebook", "instagram", "tiktok", "x", "linkedin", "snapchat"]);

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const key = token ? await verifyMcpKey(token) : null;
  if (!key) {
    return unauthorized("invalid_api_key");
  }
  const posts = await listRecentPublishes(key.organizationId, 20);
  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const key = token ? await verifyMcpKey(token) : null;
  if (!key) {
    return unauthorized("invalid_api_key");
  }
  void touchMcpKey(key.keyId);

  let payload: {
    channel?: string;
    caption?: string;
    mediaUrl?: string;
    externalId?: string;
    dryRun?: boolean;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const channel = (payload.channel ?? "").toLowerCase();
  const caption = (payload.caption ?? "").trim();
  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ error: "unsupported_channel" }, { status: 400 });
  }
  if (caption.length < 2) {
    return NextResponse.json({ error: "caption_required" }, { status: 400 });
  }

  const row = await enqueuePublish({
    caption,
    channel,
    externalId: payload.externalId,
    mediaUrl: payload.mediaUrl,
    organizationId: key.organizationId,
  });

  if (payload.dryRun) {
    return NextResponse.json({ accepted: true, dryRun: true, post: row });
  }

  if (row.status === "sent") {
    return NextResponse.json({ accepted: true, duplicate: true, post: row });
  }

  const result = await dispatchPublish({
    caption,
    channel,
    mediaUrl: payload.mediaUrl,
  });

  if (result.ok) {
    await settlePublish({ id: row.id, providerId: result.providerId, status: "sent" });
    return NextResponse.json({
      accepted: true,
      id: row.id,
      providerId: result.providerId,
      status: "sent",
    });
  }

  await settlePublish({ error: result.reason, id: row.id, status: "failed" });
  return NextResponse.json(
    { error: result.reason, id: row.id, status: "failed" },
    { status: 424 }
  );
}
