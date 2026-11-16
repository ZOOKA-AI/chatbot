import "server-only";

import { createHash } from "node:crypto";

import { decideSpend, estimateCostUsd } from "@/lib/studio/cloud-cost";
import { StudioError, store } from "@/lib/studio/media";
import {
  RunComfyError,
  cancelRequest,
  getBalance,
  listModels,
  requestResult,
  requestStatus,
  runcomfyToken,
  submitRequest,
  type RunComfyModel,
} from "@/lib/studio/runcomfy";
import type { WorkerTool } from "../worker-types";

/**
 * AI generation, as a real billable path with a gate in front of it.
 *
 * The order below is the whole design. Each step can only fail closed, and the billable call is the last
 * thing that happens, after the approval, the estimate, the cap, and the wallet have all been checked:
 *
 *   credential → model → estimate → wallet → approval gate → submit → poll → store → report
 *
 * Two protections that are not obvious:
 *
 * - A submit is never retried. The provider returns 200 with a request id, so a blind retry after a
 *   dropped response is a second bill for the same picture.
 * - A repeated request inside one process is refused by a key of tenant + model + prompt, because the
 *   queue's own dedupe covers waiting tasks, not a worker retried by two runners at once.
 */

// Both read per call so a test can compress the wait instead of sleeping for minutes.
const pollIntervalMs = () => Number(process.env.RUNCOMFY_POLL_INTERVAL_MS ?? 3_000);
const pollBudgetMs = () => Number(process.env.RUNCOMFY_POLL_BUDGET_MS ?? 120_000);

/** Requests this process has already submitted, so one job cannot become two bills. */
const inFlight = new Map<string, string>();

/** Video takes longer than an image, so the two are searched and budgeted separately. */
const CATEGORY_FOR = {
  image: "text-to-image",
  video: "text-to-video",
} as const;

function imageOrVideo(payload: Record<string, unknown>): "image" | "video" {
  const raw = String(payload.capability ?? payload.kind ?? "image").toLowerCase();
  if (raw.includes("video") || raw.includes("فيديو")) return "video";
  return "image";
}

/** Cheapest model that can do the work, chosen from the live catalogue rather than a hard-coded id. */
async function chooseModel(kind: "image" | "video", requested: string | null): Promise<RunComfyModel> {
  const category = CATEGORY_FOR[kind];
  const catalog = await listModels({ category, limit: 50 });
  if (requested) {
    const match = catalog.models.find((model) => model.modelId === requested);
    if (match) return match;
    // A requested model outside this capability is refused rather than silently substituted.
    const all = await listModels({ limit: 200 });
    const anyMatch = all.models.find((model) => model.modelId === requested);
    if (anyMatch && !anyMatch.categories.includes(category)) {
      throw new StudioError("model_wrong_capability", `${requested} does not advertise ${category}`);
    }
    return anyMatch ?? catalog.models[0];
  }
  const priced = catalog.models
    .filter((model) => model.basePriceUsd !== null)
    .sort((a, b) => (a.basePriceUsd ?? 0) - (b.basePriceUsd ?? 0));
  const chosen = priced[0] ?? catalog.models[0];
  if (!chosen) throw new StudioError("no_model_available", `the account exposes no ${category} model`);
  return chosen;
}

/** Pulls the first media URL out of a model-specific output object. */
function firstUrl(output: unknown): string | null {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const entry of output) {
      const found = firstUrl(entry);
      if (found) return found;
    }
    return null;
  }
  if (output && typeof output === "object") {
    for (const value of Object.values(output as Record<string, unknown>)) {
      const found = firstUrl(value);
      if (found) return found;
    }
  }
  return null;
}

export const studioAiGenerate: WorkerTool = {
  name: "studio_ai_generate",
  description:
    "Generates one image or video with a cloud AI model (RunComfy Model API v2). Requires an operator switch, a per-job approval, a cost estimate inside the cap, and a funded wallet; refuses before submitting otherwise.",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 180_000,
  maxAttempts: 1,
  async run({ organizationId, taskId, payload }) {
    const kind = imageOrVideo(payload);
    const capability = kind === "video" ? "video_generate" : "image_generate";
    const prompt = String(payload.prompt ?? "").trim();
    if (prompt.length < 3) return { ok: false, summary: "The prompt is empty.", error: "prompt_required" };

    if (!runcomfyToken()) {
      return {
        ok: false,
        summary: "No RunComfy credential is configured on the server, so no generation was attempted.",
        error: "not_configured",
      };
    }

    const dedupeKey = createHash("sha256")
      .update(`${organizationId}:${kind}:${String(payload.modelId ?? "")}:${prompt}`)
      .digest("hex")
      .slice(0, 32);
    const existing = inFlight.get(dedupeKey);
    if (existing) {
      return {
        ok: false,
        summary: `An identical request is already running (${existing}); it was not submitted twice.`,
        error: "duplicate_in_flight",
      };
    }

    try {
      const model = await chooseModel(kind, payload.modelId == null ? null : String(payload.modelId));
      const outputs = Math.max(1, Math.min(Number(payload.outputs ?? 1) || 1, 4));
      const seconds = payload.seconds == null ? Number(process.env.RUNCOMFY_DEFAULT_VIDEO_SECONDS ?? 5) : Number(payload.seconds);
      const estimate = estimateCostUsd(model, { outputs, seconds });

      // The wallet is read before the decision, because "did not check" is itself a refusal.
      let balanceMicrodollars: number | null = null;
      try {
        const balance = await getBalance();
        balanceMicrodollars = balance.balanceMicrodollars;
      } catch {
        balanceMicrodollars = null;
      }

      const decision = decideSpend({
        organizationId,
        userId: String(payload.userId ?? "system"),
        capability,
        model,
        outputs,
        seconds: model.priceUnit === "second" ? seconds : undefined,
        approvalReference: payload.approvalReference == null ? null : String(payload.approvalReference),
        alreadyCommittedUsd: Number(payload.alreadyCommittedUsd ?? 0) || 0,
        balanceMicrodollars,
      });

      if (!decision.allowed) {
        // Nothing has been submitted at this point, which is the point of the gate.
        return {
          ok: false,
          summary: `Generation was refused before submission: ${decision.refused.map((entry) => entry.reason).join(", ")}. ${decision.display}`.slice(0, 400),
          error: "spend_not_authorized",
          evidence: { modelId: model.modelId, estimateUsd: decision.estimatedUsd, refused: decision.refused },
        };
      }

      const body: Record<string, unknown> = { prompt };
      if (payload.aspect) body.aspect_ratio = String(payload.aspect);
      if (payload.imageUrl) body.image_url = String(payload.imageUrl);
      if (payload.seed != null) body.seed = Number(payload.seed);
      if (kind === "video" && model.priceUnit === "second") body.duration = seconds;

      inFlight.set(dedupeKey, "submitting");
      const receipt = await submitRequest(model.modelId, body);
      inFlight.set(dedupeKey, receipt.requestId);

      try {
        const budget = pollBudgetMs();
        const deadline = Date.now() + budget;
        let status = await requestStatus(receipt.requestId);
        while (status.status === "in_queue" || status.status === "in_progress") {
          if (Date.now() > deadline) {
            // Honest partial: the job exists and is billed or will be. It is not called a failure and not
            // called a success; the request id is handed back so a follow-up task can collect it.
            return {
              ok: false,
              summary: `The provider accepted the job (${receipt.requestId}) but it had not finished within ${Math.round(budget / 1000)}s. It is still running and can be collected later.`,
              error: "still_running",
              evidence: { requestId: receipt.requestId, modelId: model.modelId, estimateUsd: decision.estimatedUsd },
            };
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs()));
          status = await requestStatus(receipt.requestId);
        }

        if (status.status === "cancelled") {
          return { ok: false, summary: "The provider reports the job was cancelled.", error: "cancelled", evidence: { requestId: receipt.requestId } };
        }

        const result = await requestResult(receipt.requestId);
        if (result.status !== "succeeded") {
          return {
            ok: false,
            summary: `The provider finished with status "${result.status}".`,
            error: `provider_${result.status}`,
            evidence: { requestId: receipt.requestId, costUsd: result.costUsd },
          };
        }

        const url = firstUrl(result.output);
        if (!url) {
          return { ok: false, summary: "The provider reported success but returned no media URL.", error: "no_output", evidence: { requestId: receipt.requestId } };
        }

        // The bytes are pulled and stored in the tenant's own library, so the result is not a link that
        // expires on someone else's server.
        const download = await fetch(url, { cache: "no-store" });
        if (!download.ok) {
          return { ok: false, summary: `The output could not be downloaded (${download.status}).`, error: "download_failed", evidence: { requestId: receipt.requestId, url } };
        }
        const bytes = Buffer.from(await download.arrayBuffer());
        const mimeType = download.headers.get("content-type") ?? (kind === "video" ? "video/mp4" : "image/png");
        const asset = await store({
          organizationId,
          projectId: payload.projectId == null ? null : String(payload.projectId),
          createdBy: null,
          mimeType,
          bytes,
          label: `ai:${kind}:${model.modelId.split("/").pop()}`,
        });

        return {
          ok: true,
          summary: `Generated a ${kind} with ${model.modelId}${result.costUsd !== null ? ` for $${result.costUsd.toFixed(2)}` : ""}. It is in your studio and can be downloaded.`,
          evidence: {
            assetId: asset.id,
            kind,
            modelId: model.modelId,
            requestId: receipt.requestId,
            costUsd: result.costUsd,
            estimateUsd: decision.estimatedUsd,
            bytes: bytes.length,
            taskId: taskId ?? null,
          },
        };
      } finally {
        inFlight.delete(dedupeKey);
      }
    } catch (error) {
      inFlight.delete(dedupeKey);
      if (error instanceof StudioError) {
        return { ok: false, summary: `${error.code}${error.detail ? `: ${error.detail}` : ""}`.slice(0, 300), error: error.code };
      }
      if (error instanceof RunComfyError) {
        return {
          ok: false,
          summary: `RunComfy refused the request: ${error.code}. ${error.message}`.slice(0, 300),
          error: error.code,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, summary: "Generation failed.", error: message.slice(0, 200) };
    }
  },
};

/** Cancels a queued generation, for the studio's own cancel control. */
export async function cancelGeneration(requestId: string) {
  return cancelRequest(requestId);
}
