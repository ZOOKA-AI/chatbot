import "server-only";

/**
 * توزيع منشور على قناة واحدة. لا يدّعي نجاحاً: إن غاب توكن القناة يعيد
 * needs_token، وإن رفض المزوّد يعيد نص الرفض كما وصل.
 */

export type DispatchResult =
  | { ok: true; providerId: string }
  | { ok: false; reason: string };

const GRAPH = "https://graph.facebook.com/v21.0";

async function readGraphError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; code?: number };
    };
    return payload.error?.message
      ? `graph_${payload.error.code ?? response.status}: ${payload.error.message.slice(0, 180)}`
      : `graph_${response.status}`;
  } catch {
    return `graph_${response.status}`;
  }
}

async function publishFacebook({
  caption,
  mediaUrl,
}: {
  caption: string;
  mediaUrl?: string;
}): Promise<DispatchResult> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    return { ok: false, reason: "needs_token: META_PAGE_ID و META_PAGE_ACCESS_TOKEN" };
  }
  const endpoint = mediaUrl
    ? `${GRAPH}/${pageId}/photos`
    : `${GRAPH}/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: token });
  if (mediaUrl) {
    body.set("url", mediaUrl);
    body.set("caption", caption);
  } else {
    body.set("message", caption);
  }
  const response = await fetch(endpoint, { body, method: "POST" });
  if (!response.ok) {
    return { ok: false, reason: await readGraphError(response) };
  }
  const data = (await response.json()) as { id?: string; post_id?: string };
  const providerId = data.post_id ?? data.id;
  return providerId
    ? { ok: true, providerId }
    : { ok: false, reason: "graph_no_id" };
}

async function publishInstagram({
  caption,
  mediaUrl,
}: {
  caption: string;
  mediaUrl?: string;
}): Promise<DispatchResult> {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !token) {
    return {
      ok: false,
      reason: "needs_token: INSTAGRAM_BUSINESS_ID و INSTAGRAM_ACCESS_TOKEN",
    };
  }
  if (!mediaUrl) {
    return { ok: false, reason: "instagram_requires_media_url" };
  }
  const isVideo = /\.(mp4|mov|m4v)$/i.test(mediaUrl);
  const containerBody = new URLSearchParams({
    access_token: token,
    caption,
  });
  if (isVideo) {
    containerBody.set("media_type", "REELS");
    containerBody.set("video_url", mediaUrl);
  } else {
    containerBody.set("image_url", mediaUrl);
  }
  const container = await fetch(`${GRAPH}/${igUserId}/media`, {
    body: containerBody,
    method: "POST",
  });
  if (!container.ok) {
    return { ok: false, reason: await readGraphError(container) };
  }
  const { id: creationId } = (await container.json()) as { id?: string };
  if (!creationId) {
    return { ok: false, reason: "instagram_no_container" };
  }
  const published = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    body: new URLSearchParams({ access_token: token, creation_id: creationId }),
    method: "POST",
  });
  if (!published.ok) {
    return { ok: false, reason: await readGraphError(published) };
  }
  const data = (await published.json()) as { id?: string };
  return data.id
    ? { ok: true, providerId: data.id }
    : { ok: false, reason: "instagram_no_id" };
}

export async function dispatchPublish({
  channel,
  caption,
  mediaUrl,
}: {
  channel: string;
  caption: string;
  mediaUrl?: string;
}): Promise<DispatchResult> {
  switch (channel) {
    case "facebook":
      return publishFacebook({ caption, mediaUrl });
    case "instagram":
      return publishInstagram({ caption, mediaUrl });
    case "tiktok":
      return {
        ok: false,
        reason:
          "needs_token: TIKTOK_CLIENT_KEY و TIKTOK_CLIENT_SECRET وتوكن ناشر معتمد",
      };
    case "x":
    case "linkedin":
    case "snapchat":
      return { ok: false, reason: `channel_not_configured:${channel}` };
    default:
      return { ok: false, reason: `unknown_channel:${channel}` };
  }
}
