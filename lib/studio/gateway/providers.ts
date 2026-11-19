import "server-only";

import { estimateCostUsd } from "../cloud-cost";
import { runcomfyToken } from "../runcomfy";
import {
  cancelRequest,
  listModels as runcomfyListModels,
  requestResult,
  requestStatus,
  submitRequest,
} from "../runcomfy";
import { falCancel, falReadiness, falResult, falStatus, isFalConfigured, submitFal } from "./fal";

/**
 * The provider-independent surface.
 *
 * Every provider answers the same nine questions, and nothing outside this folder knows which vendor is
 * behind them. The two things the interface deliberately refuses to hide:
 *
 * - `readiness` returns a code, not a boolean. "Not configured" and "configured but unverified" are
 *   different states, and a caller that only reads a boolean will confuse them.
 * - `estimate` can return `unknown`. Unknown is not zero: the router refuses to price a job it cannot
 *   price, because that is how a customer approves one number and pays another.
 */

export type GatewayCapability =
  | "image_generate"
  | "video_generate"
  | "image_edit"
  | "background_remove"
  | "narration"
  | "video_render";

export type GatewayTier = "local" | "self_hosted" | "cloud";

export type ModelOffer = {
  /** The provider's own identifier, passed back verbatim on submit. Never rewritten. */
  id: string;
  label: string;
  capabilities: GatewayCapability[];
  priceUsd: number | null;
  priceUnit: "output" | "second" | "job" | null;
  /** Where the price and the model id came from, so a report can say what was verified. */
  source: "live_catalog" | "configured" | "local";
};

export type GatewayCost = {
  usd: number | null;
  kind: "free" | "estimated" | "unknown";
  note: string;
};

export type GatewayReadiness = {
  ready: boolean;
  code:
    | "ready"
    | "credential_missing"
    | "credential_unverified"
    | "endpoint_missing"
    | "paid_disabled"
    | "not_executable";
  detail: string;
};

export type GatewayJobRef = { providerId: string; modelId: string; jobId: string; handle: unknown };

export type GatewayJobStatus = {
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  position: number | null;
  detail: string | null;
};

export type GatewayOutput = {
  url: string | null;
  raw: unknown;
  /** What the provider actually charged, when it reports it. Null means "not reported". */
  providerCostUsd: number | null;
  /** True when the provider itself reports the run failed. Distinct from "succeeded but no URL". */
  failed?: boolean;
};

export type SubmitInput = {
  prompt: string;
  aspect?: string | null;
  imageUrl?: string | null;
  seed?: number | null;
  seconds?: number | null;
  outputs?: number | null;
};

export interface GatewayProvider {
  id: string;
  tier: GatewayTier;
  paid: boolean;
  capabilities: GatewayCapability[];
  /** False when the provider has no asynchronous execution of its own and runs elsewhere. */
  executable: boolean;
  readiness(env?: Record<string, string | undefined>): GatewayReadiness;
  listModels(capability: GatewayCapability, env?: Record<string, string | undefined>): Promise<ModelOffer[]>;
  estimate(offer: ModelOffer, units: { outputs?: number; seconds?: number }): GatewayCost;
  submit(offer: ModelOffer, input: SubmitInput): Promise<GatewayJobRef>;
  status(ref: GatewayJobRef): Promise<GatewayJobStatus>;
  result(ref: GatewayJobRef): Promise<GatewayOutput>;
  cancel(ref: GatewayJobRef): Promise<boolean>;
  classify(error: unknown): string;
}

/** The first media URL in a provider output, whose shape is the model's own. */
export function extractMediaUrl(output: unknown): string | null {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const entry of output) {
      const found = extractMediaUrl(entry);
      if (found) return found;
    }
    return null;
  }
  if (output && typeof output === "object") {
    for (const value of Object.values(output as Record<string, unknown>)) {
      const found = extractMediaUrl(value);
      if (found) return found;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ RunComfy */

const RUNCOMFY_CATEGORY: Record<string, string> = {
  image_generate: "text-to-image",
  video_generate: "text-to-video",
};

export const runcomfyGatewayProvider: GatewayProvider = {
  id: "runcomfy-cloud",
  tier: "cloud",
  paid: true,
  executable: true,
  capabilities: ["image_generate", "video_generate"],
  readiness(env = process.env) {
    if (!runcomfyToken(env)) {
      return { ready: false, code: "credential_missing", detail: "RUNCOMFY_API_TOKEN is not set on the server." };
    }
    return { ready: true, code: "ready", detail: "credential present; discovery and wallet are readable without charge" };
  },
  async listModels(capability) {
    const category = RUNCOMFY_CATEGORY[capability];
    if (!category) return [];
    const catalog = await runcomfyListModels({ category, limit: 50 });
    return catalog.models.map((model) => ({
      id: model.modelId,
      label: model.displayName,
      capabilities: model.categories.includes("text-to-video")
        ? (["video_generate", "image_generate"] as GatewayCapability[])
        : (["image_generate"] as GatewayCapability[]),
      priceUsd: model.basePriceUsd,
      priceUnit: model.priceUnit === "second" ? "second" : model.priceUnit === "output" ? "output" : null,
      source: "live_catalog" as const,
    }));
  },
  estimate(offer, units) {
    const usd = estimateCostUsd(
      { basePriceUsd: offer.priceUsd, priceUnit: offer.priceUnit === "second" ? "second" : offer.priceUnit === "output" ? "output" : null },
      units
    );
    return usd === null
      ? { usd: null, kind: "unknown", note: "the catalogue published no usable base rate for this model" }
      : { usd, kind: "estimated", note: `base rate ${offer.priceUsd} USD per ${offer.priceUnit}` };
  },
  async submit(offer, input) {
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.aspect) body.aspect_ratio = input.aspect;
    if (input.imageUrl) body.image_url = input.imageUrl;
    if (input.seed != null) body.seed = input.seed;
    if (input.seconds != null && offer.priceUnit === "second") body.duration = input.seconds;
    const receipt = await submitRequest(offer.id, body);
    return { providerId: this.id, modelId: offer.id, jobId: receipt.requestId, handle: receipt };
  },
  async status(ref) {
    const receipt = ref.handle as { requestId: string };
    const status = await requestStatus(receipt.requestId);
    const map: Record<string, GatewayJobStatus["state"]> = {
      in_queue: "queued",
      in_progress: "running",
      completed: "completed",
      cancelled: "cancelled",
      succeeded: "completed",
      failed: "failed",
    };
    return { state: map[status.status] ?? "running", position: status.queuePosition, detail: status.status };
  },
  async result(ref) {
    const receipt = ref.handle as { requestId: string };
    const result = await requestResult(receipt.requestId);
    if (result.status !== "succeeded") {
      return {
        url: null,
        raw: result.output,
        providerCostUsd: result.costUsd,
        failed: result.status === "failed",
      };
    }
    return { url: extractMediaUrl(result.output), raw: result.output, providerCostUsd: result.costUsd };
  },
  async cancel(ref) {
    const receipt = ref.handle as { requestId: string };
    const outcome = await cancelRequest(receipt.requestId);
    return outcome.outcome === "cancelled";
  },
  classify(error) {
    return (error as { code?: string })?.code ?? "provider_error";
  },
};

/* ----------------------------------------------------------------------- fal */

const FAL_CATEGORY: Record<string, string> = {
  image_generate: "text-to-image",
  video_generate: "text-to-video",
};

/**
 * fal publishes no catalogue endpoint on the Model API host, so the models this deployment may use are
 * the ones an operator names explicitly. That is deliberate: inventing a model list would advertise
 * availability nobody verified, and inventing prices would put a number in front of a customer that the
 * provider never quoted.
 */
export function falConfiguredModels(
  capability: GatewayCapability,
  env: Record<string, string | undefined> = process.env
): ModelOffer[] {
  const raw = capability === "video_generate" ? env.FAL_MODELS_VIDEO : env.FAL_MODELS_IMAGE;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((id) => {
      const priceKey = `FAL_PRICE_USD_${id.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;
      const price = Number(env[priceKey] ?? "");
      return {
        id,
        label: id,
        capabilities: [capability],
        // No documented public price feed: a price exists only if the owner entered one.
        priceUsd: Number.isFinite(price) && price > 0 ? price : null,
        priceUnit: capability === "video_generate" ? ("job" as const) : ("job" as const),
        source: "configured" as const,
      };
    });
}

export const falGatewayProvider: GatewayProvider = {
  id: "fal-cloud",
  tier: "cloud",
  paid: true,
  executable: true,
  capabilities: ["image_generate", "video_generate"],
  readiness(env = process.env) {
    const state = falReadiness(env);
    if (!state.configured) return { ready: false, code: "credential_missing", detail: state.detail };
    // A key's presence is not proof it authenticates, and fal offers no free call to prove it.
    return { ready: true, code: "credential_unverified", detail: state.detail };
  },
  async listModels(capability) {
    return falConfiguredModels(capability);
  },
  estimate(offer, units) {
    if (offer.priceUsd === null) {
      return { usd: null, kind: "unknown", note: "fal publishes per-model prices on the model page; none is configured for this model" };
    }
    const usd = offer.priceUnit === "second" ? offer.priceUsd * Math.max(1, units.seconds ?? 1) : offer.priceUsd;
    return { usd: Number(usd.toFixed(4)), kind: "estimated", note: `configured price ${offer.priceUsd} USD per ${offer.priceUnit}` };
  },
  async submit(offer, input) {
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.aspect) body.aspect_ratio = input.aspect;
    if (input.imageUrl) body.image_url = input.imageUrl;
    if (input.seed != null) body.seed = input.seed;
    if (input.seconds != null) body.duration = input.seconds;
    const receipt = await submitFal(offer.id, body);
    return { providerId: this.id, modelId: offer.id, jobId: receipt.requestId, handle: receipt };
  },
  async status(ref) {
    const status = await falStatus(ref.handle as { requestId: string; statusUrl: string });
    const map: Record<string, GatewayJobStatus["state"]> = {
      IN_QUEUE: "queued",
      IN_PROGRESS: "running",
      COMPLETED: "completed",
      FAILED: "failed",
      CANCELLED: "cancelled",
    };
    return { state: map[status.status], position: status.queuePosition, detail: status.status };
  },
  async result(ref) {
    const raw = await falResult(ref.handle as { requestId: string; responseUrl: string });
    return { url: extractMediaUrl(raw), raw, providerCostUsd: null };
  },
  async cancel(ref) {
    const outcome = await falCancel(ref.handle as { requestId: string; cancelUrl: string | null });
    return outcome.cancelled;
  },
  classify(error) {
    return (error as { code?: string })?.code ?? "provider_error";
  },
};

/* --------------------------------------------------- self-hosted and local */

/**
 * The owner's own ComfyUI instance. It is a real provider in the ladder, but its execution lives in the
 * existing self-hosted path (`lib/studio/providers.ts`), so this entry exists for selection and honesty
 * rather than to re-implement that client here.
 */
export const comfyGatewayProvider: GatewayProvider = {
  id: "comfyui",
  tier: "self_hosted",
  paid: false,
  executable: false,
  capabilities: ["image_generate"],
  readiness(env = process.env) {
    if (!env.COMFYUI_ENDPOINT?.trim()) {
      return { ready: false, code: "endpoint_missing", detail: "COMFYUI_ENDPOINT is not set; the owner has not connected an instance." };
    }
    return { ready: false, code: "not_executable", detail: "An endpoint is configured; generation runs through the existing self-hosted path, not this gateway." };
  },
  async listModels() {
    return [];
  },
  estimate() {
    return { usd: 0, kind: "free", note: "the owner's own hardware" };
  },
  async submit() {
    throw new Error("comfyui runs through lib/studio/providers.ts");
  },
  async status() {
    return { state: "failed", position: null, detail: "not executed by the gateway" };
  },
  async result() {
    return { url: null, raw: null, providerCostUsd: null };
  },
  async cancel() {
    return false;
  },
  classify(error) {
    return (error as { code?: string })?.code ?? "provider_error";
  },
};

/** The local engines. Free, always available, and intentionally without an asynchronous job. */
export const localGatewayProvider: GatewayProvider = {
  id: "local-engines",
  tier: "local",
  paid: false,
  executable: false,
  capabilities: ["image_edit", "background_remove", "video_render", "narration"],
  readiness() {
    return { ready: true, code: "ready", detail: "ffmpeg, rembg and Piper run on our own CPU" };
  },
  async listModels(capability) {
    return [{ id: `local:${capability}`, label: `Local ${capability}`, capabilities: [capability], priceUsd: 0, priceUnit: "job", source: "local" as const }];
  },
  estimate() {
    return { usd: 0, kind: "free", note: "no third party is billed" };
  },
  async submit() {
    throw new Error("local engines are deterministic and are invoked directly, not through the queue");
  },
  async status() {
    return { state: "completed", position: null, detail: "synchronous" };
  },
  async result() {
    return { url: null, raw: null, providerCostUsd: 0 };
  },
  async cancel() {
    return false;
  },
  classify(error) {
    return (error as { code?: string })?.code ?? "local_error";
  },
};

/** Everything this deployment knows about. Order here is not priority; the router decides that. */
export function gatewayProviders(env: Record<string, string | undefined> = process.env): GatewayProvider[] {
  void env;
  return [localGatewayProvider, comfyGatewayProvider, runcomfyGatewayProvider, falGatewayProvider];
}

export function providerById(id: string, env: Record<string, string | undefined> = process.env): GatewayProvider | null {
  return gatewayProviders(env).find((provider) => provider.id === id) ?? null;
}

export { isFalConfigured };
