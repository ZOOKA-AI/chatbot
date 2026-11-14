import { captureException } from "@sentry/nextjs";
import { generateText } from "ai";
import { after, NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { regularPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { claimWebhookEvent } from "@/lib/webhooks/events";
import { verifyHmacSha256 } from "@/lib/webhooks/security";

interface WhatsAppMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}
interface WhatsAppPayload {
  entry?: {
    id?: string;
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: WhatsAppMessage[];
      };
    }[];
  }[];
}

let missingCredentialsLogged = false;

async function replyToMessage(
  message: { id: string; from: string; body: string },
  accessToken: string,
  phoneNumberId: string
) {
  try {
    const firstDelivery = await claimWebhookEvent({
      provider: "whatsapp-reply",
      externalId: message.id,
      payload: { id: message.id },
      failClosed: true,
    });
    if (!firstDelivery) {
      return;
    }
    const { text } = await generateText({
      model: getLanguageModel(DEFAULT_CHAT_MODEL),
      system: `${regularPrompt}\n\nYou are replying on WhatsApp. Keep replies concise. You have no tools or access to customer accounts.`,
      prompt: message.body,
      abortSignal: AbortSignal.timeout(40_000),
    });
    if (!text.trim()) {
      throw new Error("WhatsApp reply was empty");
    }
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + accessToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.from,
          type: "text",
          text: { body: text },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      throw new Error(`WhatsApp send failed with status ${response.status}`);
    }
  } catch (error) {
    captureException(error, { tags: { area: "whatsapp-reply" } });
  }
}

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

  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return NextResponse.json(
      { error: "WhatsApp app secret is not configured" },
      { status: 503 }
    );
  }
  if (!verifyHmacSha256(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Meta expects an answer within seconds; the work happens after the response.
  after(async () => {
    const forwardUrl = process.env.N8N_WHATSAPP_FORWARD_URL;
    const firstMessage = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (forwardUrl) {
      try {
        const firstDelivery = await claimWebhookEvent({
          provider: "whatsapp",
          externalId: firstMessage?.id ?? `wa:${crypto.randomUUID()}`,
          payload,
        });
        if (firstDelivery) {
          const headers: Record<string, string> = {
            "content-type": "application/json",
          };
          if (process.env.N8N_WEBHOOK_SECRET) {
            headers["x-n8n-secret"] = process.env.N8N_WEBHOOK_SECRET;
          }
          await fetch(forwardUrl, {
            method: "POST",
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(5000),
          });
        }
      } catch (error) {
        captureException(error, { tags: { area: "whatsapp-forward" } });
      }
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const replies: Promise<void>[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (
            message.type !== "text" ||
            !message.id ||
            !message.from ||
            !message.text?.body?.trim()
          ) {
            continue;
          }
          if (!accessToken || !phoneNumberId) {
            if (!missingCredentialsLogged) {
              console.warn("WhatsApp reply credentials are not configured");
              missingCredentialsLogged = true;
            }
            continue;
          }
          if (change.value?.metadata?.phone_number_id !== phoneNumberId) {
            continue;
          }
          replies.push(
            replyToMessage(
              { id: message.id, from: message.from, body: message.text.body },
              accessToken,
              phoneNumberId
            )
          );
        }
      }
    }
    await Promise.all(replies);
  });

  return NextResponse.json({ received: true, provider: "whatsapp" });
}
