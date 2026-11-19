import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  disconnectIntegration,
  listWorkspaceIntegrations,
} from "@/lib/integrations/catalog";
import {
  isOAuthProviderConfigured,
  isOAuthProviderId,
} from "@/lib/integrations/oauth/config";
import {
  deleteOAuthConnection,
  getOAuthConnection,
} from "@/lib/integrations/oauth/store";
import { isTokenProviderId } from "@/lib/integrations/token-providers";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";

async function tokenProviderState(workspaceId: string, provider: string) {
  const connections = await listWorkspaceIntegrations(workspaceId);
  const row = connections.find((item) => item.providerId === provider);
  return {
    connected: row?.status === "connected",
    accountName: row?.displayName ?? null,
    connectedAt: row?.lastUsedAt ?? null,
    lastError: row?.lastError ?? null,
  };
}

async function GETImpl(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const isOAuth = isOAuthProviderId(provider);
  const isToken = isTokenProviderId(provider);
  if (!isOAuth && !isToken) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isToken) {
    const state = await tokenProviderState(
      context.organizationId,
      provider
    );
    return NextResponse.json({
      provider,
      configured: true,
      connected: state.connected,
      accountName: state.accountName,
      avatarUrl: null,
      connectedAt: state.connectedAt,
      lastError: state.lastError,
    });
  }
  const connection = await getOAuthConnection(
    context.organizationId,
    provider as "github" | "vercel" | "x"
  );
  return NextResponse.json({
    provider,
    configured: isOAuthProviderConfigured(
      provider as "github" | "vercel" | "x"
    ),
    connected: connection !== null,
    accountName: connection?.accountName ?? null,
    avatarUrl: connection?.avatarUrl ?? null,
    connectedAt: connection?.connectedAt ?? null,
  });
}

async function DELETEImpl(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const isOAuth = isOAuthProviderId(provider);
  const isToken = isTokenProviderId(provider);
  if (!isOAuth && !isToken) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(context.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (isToken) {
    await disconnectIntegration(
      context.organizationId,
      provider,
      context.user.id
    );
    return NextResponse.json({ provider, connected: false });
  }
  await deleteOAuthConnection(
    context.organizationId,
    provider as "github" | "vercel" | "x"
  );
  return NextResponse.json({ provider, connected: false });
}

async function POSTImpl(
  _request: Request,
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
  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  if (!entitlements.canConnectIntegrations) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });
  }
  if (!isOAuthProviderConfigured(provider)) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ provider, ready: true });
}

// Tenant-scoped exports: every query runs inside the caller's tenant
// transaction, so row level security is evaluated for this workspace.
export const GET = withRequestTenantHandler(GETImpl);
export const POST = withRequestTenantHandler(POSTImpl);
export const DELETE = withRequestTenantHandler(DELETEImpl);
