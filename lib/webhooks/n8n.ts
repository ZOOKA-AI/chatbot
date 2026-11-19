import { captureException } from "@sentry/nextjs";
import { NextResponse, after } from "next/server";
import { claimWebhookEvent } from "@/lib/webhooks/events";
import { verifySharedSecret } from "@/lib/webhooks/security";

type N8nPayload = {
  action?: string;
  executionId?: string | number;
  userId?: string;
  organizationId?: string;
  payloadData?: unknown;
};

export async function handleN8nWebhook(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "n8n webhook secret is not configured" },
      { status: 500 }
    );
  }
  if (
    !verifySharedSecret(
      request.headers.get("x-n8n-secret"),
      secret
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: N8nPayload;
  try {
    payload = (await request.json()) as N8nPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = payload.action ?? "sync_agent_execution";
  const externalId =
    payload.executionId === undefined
      ? `${action}:${crypto.randomUUID()}`
      : `${action}:${payload.executionId}`;

  after(async () => {
    try {
      await claimWebhookEvent({
        provider: "n8n",
        externalId,
        payload: { ...payload, action },
      });
    } catch (error) {
      captureException(error, { tags: { area: "n8n-webhook" } });
    }
  });

  return NextResponse.json({
    success: true,
    provider: "n8n",
    action,
    externalId,
  });
}
