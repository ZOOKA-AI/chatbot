import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const GRAPH = "https://graph.facebook.com/v21.0";

export const FACEBOOK_NOT_CONNECTED =
  "Facebook is not connected for this workspace. Connect it from Settings → Integrations (paste the page access token) first.";

type Credentials = { token: string; pageId: string };

export async function getFacebookCredentials(
  workspaceId: string
): Promise<Credentials | null> {
  const tokens = await getIntegrationTokens(workspaceId, "meta");
  const token = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  const pageId =
    typeof tokens?.pageId === "string" && tokens.pageId !== ""
      ? tokens.pageId
      : null;
  if (!token || !pageId) {
    return null;
  }
  return { token, pageId };
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
          : `Facebook API returned ${response.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: payload };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Facebook request failed",
    };
  }
}

export async function getFacebookPage(workspaceId: string) {
  const credentials = await getFacebookCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: FACEBOOK_NOT_CONNECTED };
  }
  const result = await graphRequest(credentials, `/${credentials.pageId}`, {
    body: {
      fields: "id,name,about,link,fan_count,followers_count,verification_status",
    },
  });
  if (!result.ok) {
    await markConnectionError(workspaceId, "meta", result.error);
    return result;
  }
  return { ok: true as const, data: result.data };
}

export async function listFacebookPosts(workspaceId: string, limit = 10) {
  const credentials = await getFacebookCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: FACEBOOK_NOT_CONNECTED };
  }
  const result = await graphRequest(
    credentials,
    `/${credentials.pageId}/posts`,
    {
      body: {
        fields:
          "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count),comments.summary(total_count)",
        limit: String(Math.min(Math.max(limit, 1), 25)),
      },
    }
  );
  if (!result.ok) {
    await markConnectionError(workspaceId, "meta", result.error);
    return result;
  }
  const items = Array.isArray(result.data.data)
    ? (result.data.data as Record<string, unknown>[])
    : [];
  return { ok: true as const, data: { count: items.length, items } };
}

/**
 * Publishes a text post (optionally with a link) to the connected Facebook
 * page feed. The caller must pass an explicit approval flag, and the post is
 * only reported as published when Facebook returns a real post id.
 */
export async function publishFacebookPost(
  workspaceId: string,
  input: { message: string; link?: string }
) {
  const credentials = await getFacebookCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: FACEBOOK_NOT_CONNECTED };
  }
  const message = input.message.trim();
  if (!message) {
    return { ok: false as const, error: "A post message is required." };
  }

  const body: Record<string, string> = { message: message.slice(0, 63_206) };
  const link = input.link?.trim();
  if (link) {
    body.link = link;
  }

  const created = await graphRequest(
    credentials,
    `/${credentials.pageId}/feed`,
    { method: "POST", body }
  );
  if (!created.ok) {
    await markConnectionError(workspaceId, "meta", created.error);
    return created;
  }
  const postId = typeof created.data.id === "string" ? created.data.id : null;
  if (!postId) {
    return {
      ok: false as const,
      error: "Facebook did not return a post id.",
    };
  }
  return {
    ok: true as const,
    data: {
      postId,
      permalink: `https://www.facebook.com/${postId}`,
    },
  };
}
