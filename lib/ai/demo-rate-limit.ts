import { setTimeout as delay } from "node:timers/promises";
import type { LanguageModelMiddleware } from "ai";

const DEFAULT_RETRY_SECONDS = 60;
const MAX_RETRY_DELAY_MS = 3000;

function errorChain(error: unknown) {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const item = error as Record<string, unknown>;
    chain.push(item);
    error = item.cause;
  }
  return chain;
}

export function rateLimitRetrySeconds(error: unknown): number | null {
  const chain = errorChain(error);
  if (!chain.some((item) => item.statusCode === 429 || item.name === "GatewayRateLimitError")) {
    return null;
  }
  for (const item of chain) {
    const headers = item.responseHeaders as Record<string, string> | undefined;
    const value = headers?.["retry-after"];
    if (!value) {
      continue;
    }
    const seconds = Number(value);
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(value) - Date.now();
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return Math.max(1, Math.ceil(milliseconds / 1000));
    }
  }
  return DEFAULT_RETRY_SECONDS;
}

export const demoRetryMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapStream: async ({ doStream, params }) => {
    try {
      return await doStream();
    } catch (error) {
      const seconds = rateLimitRetrySeconds(error);
      if (seconds === null || seconds * 1000 > MAX_RETRY_DELAY_MS) {
        throw error;
      }
      await delay(seconds * 1000, undefined, { signal: params.abortSignal });
      return doStream();
    }
  },
};

export function demoBusyMessage(seconds: number, lang: "ar" | "en") {
  return lang === "ar"
    ? `الخدمة مشغولة الآن. حاول مرة أخرى بعد ${seconds} ثانية.`
    : `The service is busy. Please try again in ${seconds} seconds.`;
}
