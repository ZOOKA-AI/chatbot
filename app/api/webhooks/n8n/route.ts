import { handleN8nWebhook } from "@/lib/webhooks/n8n";

export function POST(request: Request) {
  return handleN8nWebhook(request);
}
