import { NextResponse } from "next/server";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { handleN8nWebhook } from "@/lib/webhooks/n8n";
import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";

export const maxDuration = 60;

/**
 * Legacy single entry point kept working for already-registered provider URLs:
 *   /api/webhooks?provider=stripe|whatsapp|n8n
 * Every provider still enforces its own signature or shared secret.
 * Prefer the dedicated routes: /api/webhooks/stripe, /api/webhooks/whatsapp, /api/webhooks/n8n
 */
export function POST(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");

  switch (provider) {
    case "stripe":
      return stripeWebhook(request);
    case "whatsapp":
      return handleWhatsAppWebhook(request);
    case "n8n":
      return handleN8nWebhook(request);
    default:
      return NextResponse.json(
        { error: "Invalid provider specified" },
        { status: 400 }
      );
  }
}

export function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider === "whatsapp") {
    return verifyWhatsAppChallenge(request);
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
