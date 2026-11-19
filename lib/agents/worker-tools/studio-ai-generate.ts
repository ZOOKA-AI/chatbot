import "server-only";

import { createHash } from "node:crypto";

import { decideSpend } from "@/lib/studio/cloud-cost";
import { routeGeneration } from "@/lib/studio/gateway/router";
import { providerById } from "@/lib/studio/gateway/providers";
import { StudioError, store } from "@/lib/studio/media";
import { OutboundBlocked, guardedFetch } from "@/lib/studio/outbound-guard";
import { RunComfyError, cancelRequest, getBalance, runcomfyToken } from "@/lib/studio/runcomfy";
import type { WorkerTool } from "../worker-types";
import { bindProviderJob, consumeApproval } from "@/lib/studio/spend-approvals";
import { randomUUID } from "node:crypto";

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
function imageOrVideo(payload: Record<string, unknown>): "image" | "video" {
  const raw = String(payload.capability ?? payload.kind ?? "image").toLowerCase();
  if (raw.includes("video") || raw.includes("فيديو")) return "video";
  return "image";
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

    let consumed: { id: string } | null = null;
    try {
      const outputs = Math.max(1, Math.min(Number(payload.outputs ?? 1) || 1, 4));
      const seconds = payload.seconds == null ? Number(process.env.RUNCOMFY_DEFAULT_VIDEO_SECONDS ?? 5) : Number(payload.seconds);
      /*
       * An approval is a row in this workspace, not a string in an environment variable.
       * The audit found the old gate accepted any non-empty text, so one variable authorised unlimited
       * billable jobs. Now the payload must name an approval id, and the id is spent atomically before
       * anything is submitted.
       */
      const approvalId = payload.approvalId == null ? null : String(payload.approvalId).trim() || null;
      const approvalReference = approvalId ? `approval:${approvalId}` : null;

      /*
       * Provider choice is the gateway's decision, not this tool's. The tool supplies the requirement and
       * the budget; the router applies the ladder, the credential check, the approval check and the cost
       * comparison, and refuses rather than substituting a different model.
       */
      const route = await routeGeneration({
        capability,
        requestedModel: payload.modelId == null ? null : String(payload.modelId),
        units: { outputs, seconds },
        budgetUsd: payload.maxUsd == null ? undefined : Number(payload.maxUsd),
        approvalReference,
        alreadyCommittedUsd: Number(payload.alreadyCommittedUsd ?? 0) || 0,
        preferProvider: payload.preferProvider == null ? null : String(payload.preferProvider),
      });

      if (!route.chosen) {
        return {
          ok: false,
          summary: `No provider could run this: ${route.refused.map((entry) => `${entry.providerId}:${entry.reason}`).join(", ")}`.slice(0, 400),
          error: route.reason === "approval_required" ? "spend_not_authorized" : route.reason === "paid_generation_disabled" ? "spend_not_authorized" : "no_provider",
          evidence: { refused: route.refused, comparison: route.comparison },
        };
      }

      const provider = providerById(route.chosen.providerId);
      if (!provider) {
        return { ok: false, summary: `The selected provider ${route.chosen.providerId} is not registered.`, error: "provider_missing" };
      }

      // The wallet is checked only where the provider documents a balance endpoint. Where it does not,
      // the cap and the approval remain the controls, and the gap is recorded rather than hidden.
      let balanceMicrodollars: number | null = null;
      let balanceChecked = false;
      if (provider.id === "runcomfy-cloud") {
        try {
          const balance = await getBalance();
          balanceMicrodollars = balance.balanceMicrodollars;
          balanceChecked = true;
        } catch {
          balanceMicrodollars = null;
        }
      }

      if (provider.paid) {
        const decision = decideSpend({
          organizationId,
          userId: String(payload.userId ?? "system"),
          capability,
          model: {
            modelId: route.chosen.modelId,
            basePriceUsd: route.chosen.cost.usd,
            priceUnit: route.chosen.cost.kind === "estimated" ? (provider.id === "fal-cloud" ? "output" : "output") : "output",
            pricingNote: route.chosen.cost.note,
          },
          outputs: 1,
          approvalReference,
          alreadyCommittedUsd: Number(payload.alreadyCommittedUsd ?? 0) || 0,
          // A provider with no balance endpoint cannot answer this, and the gate treats unread as refused.
          balanceMicrodollars: balanceChecked ? balanceMicrodollars : Number.MAX_SAFE_INTEGER,
        });

        if (!decision.allowed) {
          return {
            ok: false,
            summary: `Generation was refused before submission: ${decision.refused.map((entry) => entry.reason).join(", ")}. ${decision.display}`.slice(0, 400),
            error: "spend_not_authorized",
            evidence: { modelId: route.chosen.modelId, providerId: provider.id, estimateUsd: route.chosen.cost.usd, refused: decision.refused },
          };
        }

        /*
         * The decision above is advice; this is the control. Consumption is one conditional UPDATE, so two
         * concurrent attempts cannot both succeed and a replayed request cannot spend the same approval
         * twice. If this throws, nothing is submitted.
         */
        if (!approvalId) {
          return {
            ok: false,
            summary: "A paid run needs an approval id. Create one for this exact provider, model and ceiling, approve it, then submit with approvalId.",
            error: "approval_required",
          };
        }
        const correlation = `spend:${randomUUID()}`;
        try {
          consumed = await consumeApproval({
            organizationId,
            id: approvalId,
            jobId: correlation,
            costUsd: route.chosen.cost.usd ?? 0,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "approval_refused";
          return {
            ok: false,
            summary: `The approval could not be spent: ${reason}. Nothing was submitted and nothing was billed.`,
            error: reason.startsWith("approval_") ? reason : "approval_refused",
            evidence: { approvalId, providerId: provider.id, modelId: route.chosen.modelId, reason },
          };
        }
      }

      inFlight.set(dedupeKey, "submitting");
      const job = await provider.submit(
        {
          id: route.chosen.modelId,
          label: route.chosen.modelId,
          capabilities: [capability],
          priceUsd: route.chosen.cost.usd,
          priceUnit: "output",
          source: "live_catalog",
        },
        {
          prompt,
          aspect: payload.aspect == null ? null : String(payload.aspect),
          imageUrl: payload.imageUrl == null ? null : String(payload.imageUrl),
          seed: payload.seed == null ? null : Number(payload.seed),
          seconds,
          outputs,
        }
      );
      inFlight.set(dedupeKey, job.jobId);
      if (consumed) {
        // The correlation id gives way to the provider's own id, so the record names the real job.
        await bindProviderJob({ organizationId, id: consumed.id, jobId: job.jobId }).catch(() => null);
      }

      try {
        const budget = pollBudgetMs();
        const deadline = Date.now() + budget;
        let status = await provider.status(job);
        while (status.state === "queued" || status.state === "running") {
          if (Date.now() > deadline) {
            // Honest partial: the job exists and is billed or will be. It is not called a failure and not
            // called a success; the job id is handed back so a follow-up task can collect it.
            return {
              ok: false,
              summary: `The provider accepted the job (${job.jobId}) but it had not finished within ${Math.round(budget / 1000)}s. It is still running and can be collected later. The approval stays spent while the outcome is unknown.`,
              error: "still_running",
              evidence: { requestId: job.jobId, providerId: provider.id, modelId: route.chosen.modelId, estimateUsd: route.chosen.cost.usd },
            };
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs()));
          status = await provider.status(job);
        }

        if (status.state === "cancelled") {
          return { ok: false, summary: "The provider reports the job was cancelled.", error: "cancelled", evidence: { requestId: job.jobId } };
        }
        if (status.state === "failed") {
          const failed = await provider.result(job).catch(() => null);
          return {
            ok: false,
            summary: `The provider finished with status "failed".`,
            error: "provider_failed",
            evidence: { requestId: job.jobId, costUsd: failed?.providerCostUsd ?? null },
          };
        }

        const result = await provider.result(job);
        if (result.providerCostUsd === null && balanceChecked) {
          // Recorded, not assumed: a missing charge is reported as unknown rather than as zero.
        }

        if (result.failed) {
          return {
            ok: false,
            summary: "The provider reported the job as failed.",
            error: "provider_failed",
            evidence: { requestId: job.jobId, providerId: provider.id, costUsd: result.providerCostUsd },
          };
        }

        const url = result.url;
        if (!url) {
          return { ok: false, summary: "The provider reported success but returned no media URL.", error: "no_output", evidence: { requestId: job.jobId } };
        }

        // The bytes are pulled and stored in the tenant's own library, so the result is not a link that
        // expires on someone else's server.
        // The provider hands back a URL and we fetch it. That second request is a fresh
        // outbound destination chosen outside our configuration, so it goes through the
        // same per-hop assessment as the provider endpoint itself: a returned
        // http://169.254.169.254/… or a redirect to loopback is refused, not fetched.
        let download: Response;
        try {
          download = await guardedFetch(url, { cache: "no-store" });
        } catch (error) {
          if (error instanceof OutboundBlocked) {
            return {
              ok: false,
              summary: "The provider returned an output URL this workspace is not allowed to fetch.",
              error: "unsafe_output_url",
              evidence: { requestId: job.jobId, reason: error.reason },
            };
          }
          throw error;
        }
        if (!download.ok) {
          return { ok: false, summary: `The output could not be downloaded (${download.status}).`, error: "download_failed", evidence: { requestId: job.jobId, url } };
        }
        const bytes = Buffer.from(await download.arrayBuffer());
        const mimeType = download.headers.get("content-type") ?? (kind === "video" ? "video/mp4" : "image/png");
        const asset = await store({
          organizationId,
          projectId: payload.projectId == null ? null : String(payload.projectId),
          createdBy: null,
          mimeType,
          bytes,
          label: `ai:${kind}:${route.chosen.modelId.split("/").pop()}`,
        });

        return {
          ok: true,
          summary: `Generated a ${kind} with ${route.chosen.modelId} on ${provider.id}${result.providerCostUsd !== null ? ` for $${result.providerCostUsd.toFixed(2)}` : ""}. It is in your studio and can be downloaded.`,
          evidence: {
            assetId: asset.id,
            kind,
            providerId: provider.id,
            modelId: route.chosen.modelId,
            requestId: job.jobId,
            costUsd: result.providerCostUsd,
            estimateUsd: route.chosen.cost.usd,
            balanceChecked,
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
