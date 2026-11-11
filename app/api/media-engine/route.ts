import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  createMediaJob,
  finishMediaJob,
  getMediaJob,
} from "@/lib/db/queries";

const requestSchema = z
  .object({
    actionType: z.enum(["IMAGE", "VIDEO", "MAP_3D", "CARTOON"]),
    prompt: z.string().trim().min(1).max(2000),
  })
  .strict();

const statusSchema = z.object({ jobId: z.string().uuid() });

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.MEDIA_ENGINE_WEBHOOK_URL;
  const secret = process.env.MEDIA_ENGINE_WEBHOOK_SECRET;
  if (!(webhookUrl && secret)) {
    return NextResponse.json(
      {
        error:
          "Media engine is not configured. No asset was generated and no quota was charged.",
        configured: false,
      },
      { status: 503 }
    );
  }

  const job = await createMediaJob({
    organizationId: context.organizationId,
    actionType: parsed.data.actionType,
    prompt: parsed.data.prompt,
  });

  const origin = new URL(request.url).origin;
  const body = JSON.stringify({
    jobId: job.id,
    actionType: job.actionType,
    prompt: job.prompt,
    callbackUrl: `${origin}/api/media-engine/callback`,
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zooka-signature": sign(body, secret),
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await finishMediaJob({
        id: job.id,
        status: "failed",
        error: `Media engine rejected the job (${response.status})`,
      });
      return NextResponse.json(
        { error: "Media engine rejected the job", jobId: job.id },
        { status: 502 }
      );
    }
  } catch {
    await finishMediaJob({
      id: job.id,
      status: "failed",
      error: "Media engine is unreachable",
    });
    return NextResponse.json(
      { error: "Media engine is unreachable", jobId: job.id },
      { status: 502 }
    );
  }

  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  const parsed = statusSchema.safeParse({ jobId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const job = await getMediaJob(parsed.data.jobId, context.organizationId);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    assetUrl: job.assetUrl,
    error: job.error,
    actionType: job.actionType,
  });
}
