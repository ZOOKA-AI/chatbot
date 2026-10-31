import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { validateN8nCredentials } from "@/lib/integrations/n8n/server";
import {
  deleteN8nCredentials,
  getN8nCredentials,
  normalizeN8nBaseUrl,
  saveN8nCredentials,
} from "@/lib/integrations/n8n/store";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const credentials = await getN8nCredentials(context.organizationId);
  return NextResponse.json({
    connected: credentials !== null,
    baseUrl: credentials?.baseUrl ?? null,
  });
}

export async function POST(request: Request) {
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
    baseUrl?: string;
    apiKey?: string;
  } | null;
  const baseUrl = normalizeN8nBaseUrl(body?.baseUrl ?? "");
  const apiKey = (body?.apiKey ?? "").trim();
  if (!baseUrl || apiKey.length < 20) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const validation = await validateN8nCredentials(baseUrl, apiKey);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error ?? "invalid" },
      { status: 400 }
    );
  }

  const saved = await saveN8nCredentials(context.organizationId, {
    baseUrl,
    apiKey,
  });
  if (!saved) {
    return NextResponse.json(
      { error: "encryption_unavailable" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    connected: true,
    baseUrl,
    workflowCount: validation.workflowCount ?? 0,
  });
}

export async function DELETE() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(context.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteN8nCredentials(context.organizationId);
  return NextResponse.json({ connected: false });
}
