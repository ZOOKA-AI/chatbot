import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return verifyWhatsAppChallenge(request);
}

export function POST(request: Request) {
  return handleWhatsAppWebhook(request);
}
