import { handleN8nWebhook } from "@/lib/webhooks/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleN8nWebhook(request);
}
