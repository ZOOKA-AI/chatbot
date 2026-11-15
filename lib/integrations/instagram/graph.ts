import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const GRAPH = "https://graph.facebook.com/v21.0";

export const INSTAGRAM_NOT_CONNECTED =
  "Instagram is not connected for this workspace. Connect it from Settings → Integrations (paste the page access token) first.";

type Credentials = { token: string; igUserId: string; handle: string | null };

export async function getInstagramCredentials(
  workspaceId: string
): Promise<Credentials | null> {
  const tokens = await getIntegrationTokens(workspaceId, "instagram");
  const token = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  const igUserId =
    typeof tokens?.igUserId === "string" && tokens.igUserId !== ""
      ? tokens.igUserId
      : null;
  if (!token || !igUserId) {
    return null;
  }
  return {
    token,
    igUserId,
    handle: typeof tokens?.handle === "string" ? tokens.handle : null,
  };
}

type GraphResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

async function graphRequest(
  credentials: Credentials,
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, string> }
): Promise<GraphResult> {
  const url = new URL(`${GRAPH}${path}`);
  const method = init?.method ?? "GET";
  if (method === "GET" && init?.body) {
    for (const [key, value] of Object.entries(init.body)) {
      url.searchParams.set(key, value);
    }
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        Accept: "application/json",
      },
      body:
        method === "POST" && init?.body
          ? new URLSearchParams(init.body).toString()
          : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      const message =
        typeof error?.message === "string"
          ? error.message
          : `Instagram API returned ${response.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Instagram request failed",
    };
  }
}

export async function getInstagramProfile(workspaceId: string) {
  const credentials = await getInstagramCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: INSTAGRAM_NOT_CONNECTED };
  }
  const result = await graphRequest(
    credentials,
    `/${credentials.igUserId}`,
    {
      body: {
        fields:
          "username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website",
      },
    }
  );
  if (!result.ok) {
    await markConnectionError(workspaceId, "instagram", result.error);
    return result;
  }
  return { ok: true as const, data: result.data };
}

export async function listInstagramMedia(
  workspaceId: string,
  limit = 10
) {
  const credentials = await getInstagramCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: INSTAGRAM_NOT_CONNECTED };
  }
  const result = await graphRequest(
    credentials,
    `/${credentials.igUserId}/media`,
    {
      body: {
        fields:
          "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count",
        limit: String(Math.min(Math.max(limit, 1), 25)),
      },
    }
  );
  if (!result.ok) {
    await markConnectionError(workspaceId, "instagram", result.error);
    return result;
  }
  const items = Array.isArray(result.data.data)
    ? (result.data.data as Record<string, unknown>[])
    : [];
  return { ok: true as const, data: { count: items.length, items } };
}

const POLL_ATTEMPTS = 6;
const POLL_DELAY_MS = 4_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publishes a reel (video_url) or a single image (image_url) to the connected
 * Instagram business account. Instagram requires a two-step flow: create a
 * media container, wait for it to finish processing, then publish it.
 */
export async function publishInstagramMedia(
  workspaceId: string,
  input: {
    caption: string;
    imageUrl?: string;
    videoUrl?: string;
    shareToFeed?: boolean;
  }
) {
  const credentials = await getInstagramCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: INSTAGRAM_NOT_CONNECTED };
  }
  const videoUrl = input.videoUrl?.trim();
  const imageUrl = input.imageUrl?.trim();
  if (!videoUrl && !imageUrl) {
    return {
      ok: false as const,
      error: "Provide either a public videoUrl or a public imageUrl.",
    };
  }

  const containerBody: Record<string, string> = {
    caption: input.caption.slice(0, 2_200),
  };
  if (videoUrl) {
    containerBody.media_type = "REELS";
    containerBody.video_url = videoUrl;
    containerBody.share_to_feed = input.shareToFeed === false ? "false" : "true";
  } else if (imageUrl) {
    containerBody.image_url = imageUrl;
  }

  const created = await graphRequest(
    credentials,
    `/${credentials.igUserId}/media`,
    { method: "POST", body: containerBody }
  );
  if (!created.ok) {
    await markConnectionError(workspaceId, "instagram", created.error);
    return created;
  }
  const creationId =
    typeof created.data.id === "string" ? created.data.id : null;
  if (!creationId) {
    return { ok: false as const, error: "Instagram did not return a container id." };
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const status = await graphRequest(credentials, `/${creationId}`, {
      body: { fields: "status_code,status" },
    });
    if (status.ok) {
      const code =
        typeof status.data.status_code === "string"
          ? status.data.status_code
          : null;
      if (code === "FINISHED" || code === "PUBLISHED") {
        break;
      }
      if (code === "ERROR" || code === "EXPIRED") {
        const detail =
          typeof status.data.status === "string"
            ? status.data.status
            : "Instagram could not process the media.";
        await markConnectionError(workspaceId, "instagram", detail);
        return { ok: false as const, error: detail };
      }
    }
    if (attempt < POLL_ATTEMPTS - 1) {
      await sleep(POLL_DELAY_MS);
    }
  }

  const published = await graphRequest(
    credentials,
    `/${credentials.igUserId}/media_publish`,
    { method: "POST", body: { creation_id: creationId } }
  );
  if (!published.ok) {
    await markConnectionError(workspaceId, "instagram", published.error);
    return published;
  }
  const mediaId = typeof published.data.id === "string" ? published.data.id : null;
  let permalink: string | null = null;
  if (mediaId) {
    const details = await graphRequest(credentials, `/${mediaId}`, {
      body: { fields: "permalink" },
    });
    if (details.ok) {
      permalink =
        typeof details.data.permalink === "string" ? details.data.permalink : null;
    }
  }
  return {
    ok: true as const,
    data: {
      mediaId,
      creationId,
      permalink,
      account: credentials.handle ? `@${credentials.handle}` : credentials.igUserId,
    },
  };
}
