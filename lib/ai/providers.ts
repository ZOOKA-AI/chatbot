import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

// Direct Google fallback: when the AI Gateway is not configured (no
// AI_GATEWAY_API_KEY and no Vercel OIDC runtime) but a GEMINI_API_KEY is
// present, route every request straight to Google's Generative Language API.
const USE_DIRECT_GOOGLE =
  !process.env.AI_GATEWAY_API_KEY && !!process.env.GEMINI_API_KEY;

const DIRECT_MODEL = "gemini-flash-lite-latest";
const DIRECT_MODEL_REASONING = "gemini-pro-latest";

// Model the gateway always serves on the free credit tier. When a user picks a
// model the gateway refuses (RestrictedModelsError, HTTP 403 "Free tier users
// do not have access to this model"), we transparently answer with this one
// instead of failing the whole request.
export const GATEWAY_FALLBACK_MODEL = "openai/gpt-4.1-mini";

function isRestrictedModelError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const text = `${String(record.message ?? "")} ${String(
      record.responseBody ?? ""
    )}`;
    if (
      record.name === "RestrictedModelsError" ||
      text.includes("RestrictedModelsError") ||
      text.includes("Free tier users do not have access")
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function restrictedModelFallbackMiddleware(
  modelId: string
): LanguageModelMiddleware {
  const fallback = () => gateway.languageModel(GATEWAY_FALLBACK_MODEL);
  const warn = (mode: string) =>
    console.warn("AI Gateway refused model, falling back", {
      requested: modelId,
      fallback: GATEWAY_FALLBACK_MODEL,
      mode,
    });
  return {
    specificationVersion: "v3",
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (error) {
        if (modelId === GATEWAY_FALLBACK_MODEL || !isRestrictedModelError(error)) {
          throw error;
        }
        warn("stream");
        return await fallback().doStream(params);
      }
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (error) {
        if (modelId === GATEWAY_FALLBACK_MODEL || !isRestrictedModelError(error)) {
          throw error;
        }
        warn("generate");
        return await fallback().doGenerate(params);
      }
    },
  };
}

function gatewayModel(modelId: string) {
  return wrapLanguageModel({
    model: gateway.languageModel(modelId),
    middleware: restrictedModelFallbackMiddleware(modelId),
  });
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

const GOOGLE_REQUEST_TIMEOUT_MS = 45_000;

const googleWithKey = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  fetch: (input, init) => {
    const timeout = AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return fetch(input, { ...init, signal });
  },
});

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

  if (USE_DIRECT_GOOGLE) {
    const direct = isReasoningModel
      ? googleWithKey(DIRECT_MODEL_REASONING)
      : googleWithKey(DIRECT_MODEL);
    return isReasoningModel
      ? wrapLanguageModel({
          model: direct,
          middleware: extractReasoningMiddleware({ tagName: "thinking" }),
        })
      : direct;
  }

  if (isReasoningModel) {
    const gatewayModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: gatewayModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gatewayModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  if (USE_DIRECT_GOOGLE) {
    return googleWithKey("gemini-flash-lite-latest");
  }
  return gatewayModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  if (USE_DIRECT_GOOGLE) {
    return googleWithKey(DIRECT_MODEL);
  }
  return gatewayModel("anthropic/claude-haiku-4.5");
}
