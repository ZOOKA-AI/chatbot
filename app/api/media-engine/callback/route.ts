import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { finishMediaJob } from "@/lib/db/queries";

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  assetUrl: z.string().url().optional(),
  error: z.string().max(500).optional(),
});

function signatureMatches(body: string, header: string | null, secret: string) {
  if (!header) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.MEDIA_ENGINE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await request.text();
  if (!signatureMatches(body, request.headers.get("x-zooka-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.status === "running") {
    return NextResponse.json({ ok: true });
  }

  await finishMediaJob({
    id: parsed.data.jobId,
    status: parsed.data.status,
    assetUrl: parsed.data.assetUrl ?? null,
    error: parsed.data.error ?? null,
  });

  return NextResponse.json({ ok: true });
}
