import { gateway } from "@ai-sdk/gateway";
import { put } from "@vercel/blob";
import { generateImage } from "ai";

export class ImageStageError extends Error {
  readonly stage: "provider" | "output" | "storage";
  readonly upstreamStatus: number | null;

  constructor(
    stage: "provider" | "output" | "storage",
    status: number | null = null
  ) {
    super(`Image ${stage} failed`);
    this.stage = stage;
    this.upstreamStatus = status;
  }
}

function upstreamStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  if (
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return error.statusCode;
  }
  return null;
}

export async function generateStoredImage(input: {
  organizationId: string;
  jobId: string;
  prompt: string;
  cartoon: boolean;
}) {
  const result = await generateImage({
    model: gateway.imageModel("bfl/flux-2-pro"),
    prompt: input.cartoon
      ? `Cartoon illustration. ${input.prompt}`
      : input.prompt,
    n: 1,
    size: "1024x1024",
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(120_000),
  }).catch((error: unknown) => {
    throw new ImageStageError("provider", upstreamStatus(error));
  });
  const image = result.images[0];
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = image && extensions[image.mediaType];
  if (
    !image ||
    !extension ||
    !image.uint8Array.length ||
    image.uint8Array.length > 10 * 1024 * 1024
  ) {
    throw new ImageStageError("output");
  }
  const stored = await put(
    `generated-media/${input.organizationId}/${input.jobId}.${extension}`,
    Buffer.from(image.uint8Array),
    { access: "public", contentType: image.mediaType, addRandomSuffix: true }
  ).catch((error: unknown) => {
    throw new ImageStageError("storage", upstreamStatus(error));
  });
  return stored.url;
}
