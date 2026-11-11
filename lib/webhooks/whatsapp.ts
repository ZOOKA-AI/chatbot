import { captureException } from "@sentry/nextjs";
import { NextResponse, after } from "next/server";
import { claimWebhookEvent } from "@/lib/webhooks/events";
import { verifyHmacSha256 } from "@/lib/webhooks/security";

type WhatsAppMessage = { id?: string; from?: string; text?: { body?: string } };
type WhatsAppPayload = {
  entry?: {
    id?: string;
    changes?: { value?: { messages?: WhatsAppMessage[] } }[];
  }[];
};

export async function verifyWhatsAppChallenge(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { error: "WhatsApp verify token is not configured" },
      { status: 500 }
    );
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function handleWhatsAppWebhook(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { error: "WhatsApp app secret is not configured" },
      { status: 500 }
    );
  }
  if (!verifyHmacSha256(rawBody, signature, process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const externalId =
    message?.id ?? `wa:${payload.entry?.[0]?.id ?? "unknown"}:${Date.now()}`;

  // Meta expects an answer within seconds; the work happens after the response.
  after(async () => {
    const firstDelivery = await claimWebhookEvent({
      provider: "whatsapp",
      externalId,
      payload,
    });
    if (!firstDelivery) {
      return;
    }
    const forwardUrl = process.env.N8N_WHATSAPP_FORWARD_URL;
    if (!forwardUrl) {
      return;
    }
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (process.env.N8N_WEBHOOK_SECRET) {
        headers["x-n8n-secret"] = process.env.N8N_WEBHOOK_SECRET;
      }
      await fetch(forwardUrl, { method: "POST", headers, body: rawBody });
    } catch (error) {
      captureException(error, { tags: { area: "whatsapp-forward" } });
    }
  });

  return NextResponse.json({ received: true, provider: "whatsapp" });
}
