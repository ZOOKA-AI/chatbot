import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

// Direct Google fallback: when the AI Gateway is not configured (no
// AI_GATEWAY_API_KEY and no Vercel OIDC runtime) but a GEMINI_API_KEY is
// present, route every request straight to Google's Generative Language API.
const USE_DIRECT_GOOGLE =
  !process.env.AI_GATEWAY_API_KEY && !!process.env.GEMINI_API_KEY;

const DIRECT_MODEL = "gemini-2.5-flash";
const DIRECT_MODEL_REASONING = "gemini-2.5-pro";

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

const googleWithKey = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
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
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  if (USE_DIRECT_GOOGLE) {
    return googleWithKey("gemini-2.5-flash-lite");
  }
  return gateway.languageModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  if (USE_DIRECT_GOOGLE) {
    return googleWithKey(DIRECT_MODEL);
  }
  return gateway.languageModel("anthropic/claude-haiku-4.5");
}
