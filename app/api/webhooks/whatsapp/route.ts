import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";

export const maxDuration = 60;

export function GET(request: Request) {
  return verifyWhatsAppChallenge(request);
}

export function POST(request: Request) {
  return handleWhatsAppWebhook(request);
}
