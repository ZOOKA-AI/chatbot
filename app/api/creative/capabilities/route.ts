import { NextResponse } from "next/server";
/** Public configuration hints only. A configured engine has NOT passed a live check. */
export function GET() {
  const gateway = process.env.MEDIA_ENGINE_PROVIDER === "ai-gateway";
  const configured =
    gateway &&
    Boolean(process.env.BLOB_READ_WRITE_TOKEN) &&
    Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);
  return NextResponse.json(
    {
      image: {
        configured,
        verified: false,
        model: "bfl/flux-2-pro",
        maxOutputs: 1,
        dailyAttempts: 3,
        ownerOnly: true,
      },
      video: {
        configured: Boolean(
          process.env.MEDIA_ENGINE_PROVIDER !== "ai-gateway" &&
            process.env.MEDIA_ENGINE_WEBHOOK_URL &&
            process.env.MEDIA_ENGINE_WEBHOOK_SECRET
        ),
        verified: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
