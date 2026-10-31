import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  isOAuthProviderConfigured,
  isOAuthProviderId,
} from "@/lib/integrations/oauth/config";
import {
  deleteOAuthConnection,
  getOAuthConnection,
} from "@/lib/integrations/oauth/store";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!isOAuthProviderId(provider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const connection = await getOAuthConnection(context.organizationId, provider);
  return NextResponse.json({
    provider,
    configured: isOAuthProviderConfigured(provider),
    connected: connection !== null,
    accountName: connection?.accountName ?? null,
    avatarUrl: connection?.avatarUrl ?? null,
    connectedAt: connection?.connectedAt ?? null,
  });
}

export async function DELETE(
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
  if (!["owner", "admin"].includes(context.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteOAuthConnection(context.organizationId, provider);
  return NextResponse.json({ provider, connected: false });
}

export async function POST(
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
