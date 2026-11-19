import { gateway } from "@ai-sdk/gateway";
import { put } from "@vercel/blob";
import { generateImage } from "ai";
import { blobPathToUrl } from "@/lib/blob-path";

export class ImageStageError extends Error {
  readonly stage: "provider" | "output" | "storage";
  readonly upstreamStatus: number | null;
  readonly category: string;

  constructor(
    stage: "provider" | "output" | "storage",
    status: number | null = null,
    category = "unknown"
  ) {
    super(`Image ${stage} failed`);
    this.stage = stage;
    this.upstreamStatus = status;
    this.category = category;
  }
}

const knownErrors: Record<string, string> = {
  AI_APICallError: "http",
  GatewayAuthenticationError: "authentication",
  AI_LoadAPIKeyError: "missing_api_key",
  AI_NoImageGeneratedError: "empty_output",
  AI_UnsupportedFunctionalityError: "unsupported",
  AI_TypeValidationError: "response_validation",
  AI_JSONParseError: "response_json",
  AI_RetryError: "retry_wrapper",
  AbortError: "aborted",
  TimeoutError: "timeout",
  TypeError: "transport_or_type",
};

export function classifyImageError(error: unknown) {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  let category = "unknown";
  let status: number | null = null;
  for (let index = 0; index < queue.length && index < 8; index++) {
    const value = queue[index];
    if (!value || typeof value !== "object" || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (
      "name" in value &&
      typeof value.name === "string" &&
      Object.hasOwn(knownErrors, value.name)
    ) {
      category = knownErrors[value.name];
    }
    if (
      "statusCode" in value &&
      typeof value.statusCode === "number" &&
      Number.isInteger(value.statusCode) &&
      value.statusCode >= 400 &&
      value.statusCode <= 599
    ) {
      status = value.statusCode;
    }
    if ("cause" in value) {
      queue.push(value.cause);
    }
    if ("lastError" in value) {
      queue.push(value.lastError);
    }
  }
  return { category, status };
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
    const diagnostic = classifyImageError(error);
    throw new ImageStageError(
      "provider",
      diagnostic.status,
      diagnostic.category
    );
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
    `${input.organizationId}/generated-media/${input.jobId}.${extension}`,
    Buffer.from(image.uint8Array),
    { access: "private", contentType: image.mediaType, addRandomSuffix: true }
  ).catch((error: unknown) => {
    const diagnostic = classifyImageError(error);
    throw new ImageStageError(
      "storage",
      diagnostic.status,
      diagnostic.category
    );
  });
  return blobPathToUrl(stored.pathname);
}
