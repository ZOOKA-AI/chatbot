import { NextResponse } from "next/server";
import { z } from "zod";
import { finishMediaJob } from "@/lib/db/queries";
import {
  isAllowedMediaAsset,
  mediaSignatureMatches,
} from "@/lib/media/callback";

const payloadSchema = z.discriminatedUnion("status", [
  z.object({ jobId: z.string().uuid(), status: z.literal("running") }).strict(),
  z
    .object({
      jobId: z.string().uuid(),
      status: z.literal("succeeded"),
      assetUrl: z.string().url().max(2048),
    })
    .strict(),
  z
    .object({
      jobId: z.string().uuid(),
      status: z.literal("failed"),
      error: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
const maxBodyBytes = 16_384;

async function receiveCallback(request: Request) {
  const secret = process.env.MEDIA_ENGINE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  // Read with a hard cap; verify the exact bytes, not JSON reserialization.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        length += chunk.value.byteLength;
        if (length > maxBodyBytes) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 }
          );
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = Buffer.concat(chunks);
  if (
    !mediaSignatureMatches(
      bytes,
      request.headers.get("x-zooka-signature"),
      secret
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const payload = parsed.data;
  if (
    payload.status === "succeeded" &&
    !isAllowedMediaAsset(
      payload.assetUrl,
      process.env.MEDIA_ENGINE_ASSET_HOSTS ?? ""
    )
  ) {
    return NextResponse.json(
      { error: "Asset origin is not allowed" },
      { status: 400 }
    );
  }
  const updated = await finishMediaJob({
    id: payload.jobId,
    status: payload.status,
    assetUrl: payload.status === "succeeded" ? payload.assetUrl : null,
    error: payload.status === "failed" ? payload.error : null,
  });
  // A duplicate/late callback (or unknown ID) never creates a job or changes one.
  return NextResponse.json({ ok: true, ignored: !updated });
}

export async function POST(request: Request) {
  try {
    return await receiveCallback(request);
  } catch {
    return NextResponse.json(
      { error: "Unable to process callback" },
      { status: 500 }
    );
  }
}
