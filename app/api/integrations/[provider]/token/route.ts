import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  isOAuthProviderConfigured,
  isOAuthProviderId,
  OAUTH_PROVIDERS,
} from "@/lib/integrations/oauth/config";
import {
  getOAuthAccessToken,
  saveOAuthConnection,
} from "@/lib/integrations/oauth/store";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

/**
 * BYOK fallback for providers whose OAuth app is not configured yet: the
 * workspace admin pastes a personal access token instead. The token is validated
 * against the provider, stored as AES-256-GCM ciphertext, and read back once to
 * prove the round trip before we report success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!isOAuthProviderId(provider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(context.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  if (!entitlements.canConnectIntegrations) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string;
  } | null;
  const token = (body?.token ?? "").trim();
  if (token.length < 20) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const definition = OAUTH_PROVIDERS[provider];
  let account = {
    accountId: null as string | null,
    accountName: null as string | null,
    avatarUrl: null as string | null,
  };
  try {
    const response = await fetch(definition.userUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "zooka-ai",
      },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "token_rejected" }, { status: 400 });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "provider_unreachable" },
        { status: 502 }
      );
    }
    account = definition.describeAccount(
      (await response.json()) as Record<string, unknown>
    );
  } catch {
    return NextResponse.json(
      { error: "provider_unreachable" },
      { status: 502 }
    );
  }

  const stored = await saveOAuthConnection({
    organizationId: context.organizationId,
    provider,
    tokens: { accessToken: token, tokenType: "bearer" },
    accountId: account.accountId,
    accountName: account.accountName,
    avatarUrl: account.avatarUrl,
    scopes: definition.scopes.join(" "),
    tokenExpiresAt: null,
  });
  if (!stored) {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  const readBack = await getOAuthAccessToken(context.organizationId, provider);
  return NextResponse.json({
    provider,
    connected: true,
    accountName: account.accountName,
    oauthAvailable: isOAuthProviderConfigured(provider),
    encryptedRoundTrip: readBack === token,
  });
}
