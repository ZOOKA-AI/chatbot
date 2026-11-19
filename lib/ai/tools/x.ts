import { tool } from "ai";
import { z } from "zod";
import {
  getStoredOAuthTokenBundle,
  updateOAuthTokensIfUnchanged,
} from "@/lib/integrations/oauth/store";
import { refreshXTokenBundle } from "@/lib/integrations/x/token-refresh";

const API = "https://api.x.com/2";
const NOT_CONNECTED =
  "X is not connected for this workspace. Connect it from Settings → Integrations first.";

async function getXAccessToken(organizationId: string) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const stored = await getStoredOAuthTokenBundle(organizationId, "x");
  if (!stored) {
    return null;
  }
  if (
    !stored.tokenExpiresAt ||
    stored.tokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return stored.tokens.accessToken;
  }
  if (!clientId || !clientSecret) {
    return null;
  }
  const refreshed = await refreshXTokenBundle(stored.tokens, {
    clientId,
    clientSecret,
  });
  if (!refreshed) {
    return null;
  }
  const saved = await updateOAuthTokensIfUnchanged({
    organizationId,
    provider: "x",
    previousEncryptedTokens: stored.encryptedTokens,
    tokens: refreshed.tokens,
    tokenExpiresAt: refreshed.expiresAt,
  });
  if (saved) {
    return refreshed.tokens.accessToken;
  }
  const current = await getStoredOAuthTokenBundle(organizationId, "x");
  return current &&
    current.tokenExpiresAt &&
    current.tokenExpiresAt.getTime() > Date.now() + 60_000
    ? current.tokens.accessToken
    : null;
}

async function xRequest(
  organizationId: string,
  path: string,
  init?: { method: string; body?: unknown }
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const token = await getXAccessToken(organizationId);
  if (!token) {
    return { ok: false, error: NOT_CONNECTED };
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: ["Bearer", token].join(" "),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: "X request failed or timed out." };
  }
  if (response.status === 401) {
    return {
      ok: false,
      error:
        "X rejected the stored token. Reconnect X from Settings → Integrations.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `X request failed with status ${response.status}.`,
    };
  }
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, error: "X returned an unreadable response." };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function createXTools(organizationId: string) {
  return {
    readXProfile: tool({
      description: "Read the profile for the connected X account.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await xRequest(
          organizationId,
          "/users/me?user.fields=profile_image_url"
        );
        if (!result.ok) {
          return { error: result.error };
        }
        const user = asRecord(asRecord(result.data).data);
        return {
          id: str(user.id),
          name: str(user.name),
          username: str(user.username),
          profileImageUrl: str(user.profile_image_url),
        };
      },
    }),

    postToX: tool({
      description:
        "Publish a post on the connected X account. Requires the user's approval before it runs.",
      inputSchema: z.object({
        text: z.string().trim().min(1).max(280),
      }),
      needsApproval: true,
      execute: async ({ text }) => {
        const result = await xRequest(organizationId, "/tweets", {
          method: "POST",
          body: { text },
        });
        if (!result.ok) {
          return { error: result.error };
        }
        const id = str(asRecord(asRecord(result.data).data).id);
        if (!id) {
          return {
            error:
              "X did not return a post ID, so the post could not be confirmed.",
          };
        }
        return { posted: true, id };
      },
    }),
  };
}
