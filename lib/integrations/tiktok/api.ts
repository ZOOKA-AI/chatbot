import "server-only";

import { rateLimitDelayMs } from "@/lib/integrations/tiktok/queue";
import {
  TIKTOK_API_BASE,
  TIKTOK_REVOKE_URL,
  TIKTOK_TOKEN_URL,
  tiktokClientKey,
  tiktokClientSecret,
  tiktokRedirectUri,
} from "@/lib/integrations/tiktok/config";
import { contentRangeHeader } from "@/lib/integrations/tiktok/validate";

/**
 * Thin client over the four documented TikTok endpoints this product uses.
 * Every call returns a discriminated result instead of throwing, so a route can
 * report the provider's own error code to the user without leaking a token.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export interface TiktokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export type TiktokResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; detail?: string; retryAfterMs?: number };

/**
 * A 429 is not a failed video. It says the account is throttled, so the caller
 * has to park the job for as long as the platform asked instead of spending an
 * attempt. The delay is parsed by the queue's clamp so every caller agrees.
 */
function rateLimitedFailure(response: Response, detail?: string) {
  return {
    ok: false as const,
    error: "rate_limited",
    detail,
    retryAfterMs: rateLimitDelayMs(response.headers.get("retry-after")),
  };
}

async function postForm(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Promise<TiktokResult<Record<string, unknown>>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
        ...extraHeaders,
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (response.status === 429) {
      return rateLimitedFailure(response, "http_429");
    }
    if (!response.ok) {
      return {
        ok: false,
        error: typeof payload?.error === "string" ? payload.error : `http_${response.status}`,
        detail:
          typeof payload?.error_description === "string"
            ? payload.error_description
            : undefined,
      };
    }
    if (!payload) {
      return { ok: false, error: "empty_response" };
    }
    return { ok: true, value: payload };
  } catch (error) {
    return {
      ok: false,
      error: "network_error",
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}

function tokensFromPayload(payload: Record<string, unknown>): TiktokResult<TiktokTokens> {
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const openId = typeof payload.open_id === "string" ? payload.open_id : "";
  const expiresIn = Number(payload.expires_in);
  const refreshExpiresIn = Number(payload.refresh_expires_in);
  if (!accessToken || !refreshToken || !openId) {
    return { ok: false, error: "invalid_token_response" };
  }
  const now = Date.now();
  return {
    ok: true,
    value: {
      accessToken,
      refreshToken,
      openId,
      scope: typeof payload.scope === "string" ? payload.scope : "",
      accessExpiresAt: new Date(now + (Number.isFinite(expiresIn) ? expiresIn : 86_400) * 1000),
      refreshExpiresAt: new Date(
        now + (Number.isFinite(refreshExpiresIn) ? refreshExpiresIn : 31_536_000) * 1000
      ),
    },
  };
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string
): Promise<TiktokResult<TiktokTokens>> {
  const clientKey = tiktokClientKey();
  const clientSecret = tiktokClientSecret();
  if (!clientKey || !clientSecret) {
    return { ok: false, error: "not_configured" };
  }
  const result = await postForm(TIKTOK_TOKEN_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: tiktokRedirectUri(),
    code_verifier: codeVerifier,
  });
  if (!result.ok) {
    return result;
  }
  return tokensFromPayload(result.value);
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TiktokResult<TiktokTokens>> {
  const clientKey = tiktokClientKey();
  const clientSecret = tiktokClientSecret();
  if (!clientKey || !clientSecret) {
    return { ok: false, error: "not_configured" };
  }
  const result = await postForm(TIKTOK_TOKEN_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!result.ok) {
    return result;
  }
  return tokensFromPayload(result.value);
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  const clientKey = tiktokClientKey();
  const clientSecret = tiktokClientSecret();
  if (!clientKey || !clientSecret) {
    return false;
  }
  const result = await postForm(TIKTOK_REVOKE_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });
  return result.ok;
}

async function getJson(
  url: string,
  accessToken: string
): Promise<TiktokResult<Record<string, unknown>>> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!response.ok) {
      if (response.status === 429) return rateLimitedFailure(response, "http_429");
      return { ok: false, error: `http_${response.status}` };
    }
    if (!payload) {
      return { ok: false, error: "empty_response" };
    }
    const error = payload.error as { code?: string; message?: string } | undefined;
    if (error?.code && error.code !== "ok") {
      return {
        ok: false,
        error: error.code,
        detail: typeof error.message === "string" ? error.message : undefined,
      };
    }
    return { ok: true, value: payload };
  } catch (caught) {
    return {
      ok: false,
      error: "network_error",
      detail: caught instanceof Error ? caught.message : undefined,
    };
  }
}

export interface TiktokAccount {
  openId: string;
  unionId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function fetchAccount(accessToken: string): Promise<TiktokResult<TiktokAccount>> {
  const result = await getJson(
    `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,union_id,display_name,avatar_url`,
    accessToken
  );
  if (!result.ok) {
    return result;
  }
  const data = (result.value.data ?? {}) as Record<string, unknown>;
  const user = (data.user ?? {}) as Record<string, unknown>;
  const openId = typeof user.open_id === "string" ? user.open_id : "";
  if (!openId) {
    return { ok: false, error: "missing_open_id" };
  }
  return {
    ok: true,
    value: {
      openId,
      unionId: typeof user.union_id === "string" ? user.union_id : null,
      displayName: typeof user.display_name === "string" ? user.display_name : null,
      avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
    },
  };
}

export interface TiktokCreatorInfo {
  creatorUsername: string | null;
  maxVideoPostDurationSec: number | null;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  privacyLevelOptions: string[];
}

export async function queryCreatorInfo(
  accessToken: string
): Promise<TiktokResult<TiktokCreatorInfo>> {
  const result = await postForm(
    `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
    {},
    { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" }
  );
  if (!result.ok) {
    return result;
  }
  const data = (result.value.data ?? {}) as Record<string, unknown>;
  const options = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ok: true,
    value: {
      creatorUsername:
        typeof data.creator_username === "string" ? data.creator_username : null,
      maxVideoPostDurationSec:
        typeof data.max_video_post_duration_sec === "number"
          ? data.max_video_post_duration_sec
          : null,
      commentDisabled: data.comment_disabled === true,
      duetDisabled: data.duet_disabled === true,
      stitchDisabled: data.stitch_disabled === true,
      privacyLevelOptions: options,
    },
  };
}

export interface TiktokUploadTicket {
  publishId: string;
  uploadUrl: string;
}

export async function initInboxUpload(
  accessToken: string,
  input: { size: number; chunkSize: number; totalChunkCount: number }
): Promise<TiktokResult<TiktokUploadTicket>> {
  try {
    const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          video_size: input.size,
          chunk_size: input.chunkSize,
          total_chunk_count: input.totalChunkCount,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const error = payload?.error as { code?: string; message?: string } | undefined;
    if (!response.ok || (error?.code && error.code !== "ok")) {
      return {
        ok: false,
        error: error?.code ?? `http_${response.status}`,
        detail: typeof error?.message === "string" ? error.message : undefined,
      };
    }
    const data = (payload?.data ?? {}) as Record<string, unknown>;
    const publishId = typeof data.publish_id === "string" ? data.publish_id : "";
    const uploadUrl = typeof data.upload_url === "string" ? data.upload_url : "";
    if (!publishId || !uploadUrl) {
      return { ok: false, error: "missing_publish_id" };
    }
    return { ok: true, value: { publishId, uploadUrl } };
  } catch (caught) {
    return {
      ok: false,
      error: "network_error",
      detail: caught instanceof Error ? caught.message : undefined,
    };
  }
}

export async function putChunk(
  uploadUrl: string,
  chunk: Buffer,
  range: { start: number; end: number; length: number },
  totalBytes: number
): Promise<TiktokResult<true>> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": contentRangeHeader(range, totalBytes),
      },
      body: new Uint8Array(chunk),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, error: `http_${response.status}` };
    }
    return { ok: true, value: true };
  } catch (caught) {
    return {
      ok: false,
      error: "network_error",
      detail: caught instanceof Error ? caught.message : undefined,
    };
  }
}

export interface TiktokPublishStatus {
  status: string;
  failReason: string | null;
  uploadedBytes: number | null;
}

export async function fetchPublishStatus(
  accessToken: string,
  publishId: string
): Promise<TiktokResult<TiktokPublishStatus>> {
  try {
    const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const error = payload?.error as { code?: string; message?: string } | undefined;
    if (!response.ok || (error?.code && error.code !== "ok")) {
      return {
        ok: false,
        error: error?.code ?? `http_${response.status}`,
        detail: typeof error?.message === "string" ? error.message : undefined,
      };
    }
    const data = (payload?.data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      value: {
        status: typeof data.status === "string" ? data.status : "UNKNOWN",
        failReason: typeof data.fail_reason === "string" ? data.fail_reason : null,
        uploadedBytes:
          typeof data.uploaded_bytes === "number" ? data.uploaded_bytes : null,
      },
    };
  } catch (caught) {
    return {
      ok: false,
      error: "network_error",
      detail: caught instanceof Error ? caught.message : undefined,
    };
  }
}
