import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const LINKEDIN_API = "https://api.linkedin.com";

export const LINKEDIN_NOT_CONNECTED =
  "LinkedIn is not connected for this workspace. Connect it from Settings → Integrations (paste the member access token) first.";

type Credentials = { token: string };

export async function getLinkedInCredentials(
  workspaceId: string
): Promise<Credentials | null> {
  const tokens = await getIntegrationTokens(workspaceId, "linkedin");
  const token = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  if (!token) {
    return null;
  }
  return { token };
}

type ApiResult =
  | { ok: true; data: Record<string, unknown>; headers: Headers }
  | { ok: false; error: string };

async function linkedInRequest(
  credentials: Credentials,
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<ApiResult> {
  const method = init?.method ?? "GET";
  try {
    const response = await fetch(`${LINKEDIN_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202405",
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(init?.body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    if (!response.ok) {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : `LinkedIn API returned ${response.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: payload, headers: response.headers };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "LinkedIn request failed",
    };
  }
}

export async function getLinkedInProfile(workspaceId: string) {
  const credentials = await getLinkedInCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: LINKEDIN_NOT_CONNECTED };
  }
  const result = await linkedInRequest(credentials, "/v2/userinfo");
  if (!result.ok) {
    await markConnectionError(workspaceId, "linkedin", result.error);
    return { ok: false as const, error: result.error };
  }
  const { sub, name, given_name, family_name, email, email_verified, picture } =
    result.data as Record<string, unknown>;
  return {
    ok: true as const,
    data: {
      memberId: sub ?? null,
      name: name ?? [given_name, family_name].filter(Boolean).join(" ") ?? null,
      email: email ?? null,
      emailVerified: email_verified ?? null,
      picture: picture ?? null,
    },
  };
}

/**
 * Publishes a text post to the connected member profile. The caller must pass
 * an explicit approval flag, and the post is only reported as published when
 * LinkedIn returns the post id in the x-restli-id header.
 */
export async function publishLinkedInPost(
  workspaceId: string,
  input: { text: string }
) {
  const credentials = await getLinkedInCredentials(workspaceId);
  if (!credentials) {
    return { ok: false as const, error: LINKEDIN_NOT_CONNECTED };
  }
  const text = input.text.trim();
  if (!text) {
    return { ok: false as const, error: "A post text is required." };
  }
  if (text.length > 3_000) {
    return {
      ok: false as const,
      error: "LinkedIn posts are limited to 3000 characters.",
    };
  }

  const profile = await linkedInRequest(credentials, "/v2/userinfo");
  if (!profile.ok) {
    await markConnectionError(workspaceId, "linkedin", profile.error);
    return { ok: false as const, error: profile.error };
  }
  const memberId =
    typeof profile.data.sub === "string" ? profile.data.sub : null;
  if (!memberId) {
    return {
      ok: false as const,
      error: "LinkedIn did not return a member id for this token.",
    };
  }

  const created = await linkedInRequest(credentials, "/rest/posts", {
    method: "POST",
    body: {
      author: `urn:li:person:${memberId}`,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
  });
  if (!created.ok) {
    await markConnectionError(workspaceId, "linkedin", created.error);
    return { ok: false as const, error: created.error };
  }
  const postId = created.headers.get("x-restli-id");
  if (!postId) {
    return {
      ok: false as const,
      error: "LinkedIn accepted the request but returned no post id.",
    };
  }
  return { ok: true as const, data: { postId } };
}
