import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  createMediaJob,
  finishMediaJob,
  getMediaJob,
  reserveGatewayImage,
} from "@/lib/db/queries";
import {
  generateStoredImage,
  ImageStageError,
} from "@/lib/media/gateway-image";

export const maxDuration = 180;

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

async function createJob(request: Request) {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
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

  if (process.env.MEDIA_ENGINE_PROVIDER === "ai-gateway") {
    if (context.role !== "owner") {
      return NextResponse.json(
        { error: "Image pilot is restricted to workspace owners" },
        { status: 403 }
      );
    }
    const { actionType, prompt } = parsed.data;
    if (actionType !== "IMAGE" && actionType !== "CARTOON") {
      return NextResponse.json(
        {
          error:
            "This provider currently supports images only, not video or 3D",
        },
        { status: 422 }
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Image storage is not configured" },
        { status: 503 }
      );
    }
    const job = await reserveGatewayImage({
      organizationId: context.organizationId,
      actionType,
      prompt,
    });
    if (!job) {
      return NextResponse.json(
        { error: "Daily image attempt limit reached (3 per workspace, UTC)" },
        { status: 429 }
      );
    }
    try {
      const assetUrl = await generateStoredImage({
        organizationId: context.organizationId,
        jobId: job.id,
        prompt,
        cartoon: actionType === "CARTOON",
      });
      const saved = await finishMediaJob({
        id: job.id,
        status: "succeeded",
        assetUrl,
      });
      if (!saved) {
        throw new Error("Unable to commit image result");
      }
      return NextResponse.json(
        { jobId: job.id, status: "succeeded" },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      const reference = randomUUID();
      const stage =
        error instanceof ImageStageError ? error.stage : "persistence";
      console.error("[media-image] operation failed", {
        reference,
        stage,
        upstreamStatus:
          error instanceof ImageStageError ? error.upstreamStatus : null,
      });
      try {
        await finishMediaJob({
          id: job.id,
          status: "failed",
          error: `Image ${stage} failed. Reference: ${reference}`,
        });
      } catch {
        console.error("[media-image] failure status could not be persisted", {
          reference,
        });
      }
      return NextResponse.json(
        {
          jobId: job.id,
          code: `IMAGE_${stage.toUpperCase()}_FAILED`,
          reference,
          error: `تعذّر إكمال الصورة في مرحلة ${stage}. مرجع الدعم: ${reference}`,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
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
      signal: AbortSignal.timeout(15_000),
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

  return NextResponse.json(
    { jobId: job.id, status: "queued" },
    { status: 202 }
  );
}

async function readJob(request: Request) {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
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

export async function POST(request: Request) {
  try {
    return await createJob(request);
  } catch {
    return NextResponse.json({ error: "تعذّر تنفيذ الطلب" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    return await readJob(request);
  } catch {
    return NextResponse.json({ error: "تعذّر قراءة الطلب" }, { status: 500 });
  }
}
