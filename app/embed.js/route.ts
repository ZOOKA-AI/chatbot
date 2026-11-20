import { EMBED_SCRIPT } from "@/lib/embed-script";
export function GET() {
  return new Response(EMBED_SCRIPT, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}
