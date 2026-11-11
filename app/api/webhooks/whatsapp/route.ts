import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";

export function GET(request: Request) {
  return verifyWhatsAppChallenge(request);
}

export function POST(request: Request) {
  return handleWhatsAppWebhook(request);
}
