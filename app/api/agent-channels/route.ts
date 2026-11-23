import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { listAgentChannels, linkAgentChannel } from "@/lib/db/agent-channels";
import { getWorkspaceSecretMetadata } from "@/lib/db/workspace-secrets";
import {
  isChannelProvider,
  isValidExternalId,
  normalizeExternalId,
} from "@/lib/agent/channels/providers";

export const dynamic = "force-dynamic";

async function GETImpl() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const channels = await listAgentChannels(context.organizationId);
  return NextResponse.json({
    channels: channels.map((channel) => ({
      id: channel.id,
      provider: channel.provider,
      externalId: channel.externalId,
      displayName: channel.displayName,
      enabled: channel.enabled,
      messageCount: channel.messageCount,
      lastSeenAt: channel.lastSeenAt,
      secretName: channel.secretName,
    })),
  });
}

async function POSTImpl(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { provider?: unknown; externalId?: unknown; displayName?: unknown; secretName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider : "";
  if (!isChannelProvider(provider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
  }

  const externalId = normalizeExternalId(provider, typeof body.externalId === "string" ? body.externalId : "");
  if (!isValidExternalId(provider, externalId)) {
    return NextResponse.json({ error: "invalid_sender" }, { status: 400 });
  }

  const secretName = typeof body.secretName === "string" ? body.secretName.trim() : "";
  if (!secretName) {
    return NextResponse.json({ error: "missing_secret" }, { status: 400 });
  }
  // The credential must already exist in the workspace vault; linking never
  // creates or stores a token itself.
  const secret = await getWorkspaceSecretMetadata(context.organizationId, secretName);
  if (!secret) {
    return NextResponse.json({ error: "secret_not_found" }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim().slice(0, 120) : null;

  const channel = await linkAgentChannel({
    organizationId: context.organizationId,
    provider,
    externalId,
    displayName,
    secretName,
    createdBy: context.user.id,
  });

  if (!channel) {
    return NextResponse.json({ error: "channels_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    channel: {
      id: channel.id,
      provider: channel.provider,
      externalId: channel.externalId,
      displayName: channel.displayName,
      enabled: channel.enabled,
      secretName: channel.secretName,
    },
  });
}

export const GET = withRequestTenantHandler(GETImpl);
export const POST = withRequestTenantHandler(POSTImpl);
