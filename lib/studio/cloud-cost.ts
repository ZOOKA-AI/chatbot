import "server-only";

import { DEFAULT_SPEND_CAP_USD, paidGenerationEnabled, spendCapUsd } from "./paid-switch";
import type { RunComfyModel } from "./runcomfy";

export { paidGenerationEnabled, spendCapUsd };

/**
 * The gate in front of billable inference.
 *
 * The owner's rule, stated as code: an API token is not permission to spend. So a generation request has
 * to clear five separate checks before anything is submitted, and each refusal names exactly what is
 * missing rather than failing vaguely:
 *
 *   1. the operator enabled paid generation at all (default: off)
 *   2. this specific job carries an approval reference
 *   3. the estimate is inside the configured per-job cap
 *   4. the whole run stays inside the configured per-run spend limit
 *   5. the wallet actually holds the estimate
 *
 * Nothing here talks to the provider; it only decides. The transport is separate so the decision can be
 * tested without a token, a network, or a cent.
 */

export type Env = Record<string, string | undefined>;

export type SpendRequest = {
  organizationId: string;
  userId: string;
  capability: "image_generate" | "video_generate";
  model: Pick<RunComfyModel, "modelId" | "basePriceUsd" | "priceUnit" | "pricingNote">;
  /** How many outputs are being asked for, when the model bills per output. */
  outputs?: number;
  /** How many seconds of video, when the model bills per second. */
  seconds?: number;
  /** The approval this job cites. Without one, nothing is submitted. */
  approvalReference?: string | null;
  /** How much has already been authorised in this run, for the running limit. */
  alreadyCommittedUsd?: number;
  /** The wallet, read from GET /v2/balance. Null means "did not check", which is not good enough. */
  balanceMicrodollars?: number | null;
};

export type SpendDecision = {
  allowed: boolean;
  estimatedUsd: number | null;
  capUsd: number;
  /** What the customer is shown before approving. */
  display: string;
  refused: Array<{ check: string; reason: string }>;
};

const DEFAULT_CAP_USD = DEFAULT_SPEND_CAP_USD;

/**
 * Estimates cost from the documented pricing model: `base_price_usd` times the billing unit.
 *
 * It is an estimate and the UI must say so: the provider's own docs state the base rate is not the final
 * price for every model, and the only authoritative figure is `cost` on the result with `include_cost=true`.
 * A model whose unit or base rate is unknown yields null, and null is a refusal, not a zero.
 */
export function estimateCostUsd(
  model: Pick<RunComfyModel, "basePriceUsd" | "priceUnit">,
  units: { outputs?: number; seconds?: number } = {}
): number | null {
  const base = model.basePriceUsd;
  if (base === null || !Number.isFinite(base) || base < 0) return null;
  if (model.priceUnit === "output") {
    const count = Math.max(1, Math.floor(units.outputs ?? 1));
    return Number((base * count).toFixed(4));
  }
  if (model.priceUnit === "second") {
    const seconds = units.seconds;
    if (!Number.isFinite(seconds) || (seconds ?? 0) <= 0) return null;
    return Number((base * (seconds as number)).toFixed(4));
  }
  return null;
}

export function decideSpend(request: SpendRequest, env: Env = process.env): SpendDecision {
  const cap = spendCapUsd(env);
  const estimate = estimateCostUsd(request.model, { outputs: request.outputs, seconds: request.seconds });
  const refused: Array<{ check: string; reason: string }> = [];

  if (!paidGenerationEnabled(env)) {
    refused.push({ check: "operator_switch", reason: "paid_generation_disabled" });
  }
  if (!request.approvalReference || !request.approvalReference.trim()) {
    refused.push({ check: "approval", reason: "approval_required" });
  }
  if (estimate === null) {
    refused.push({ check: "estimate", reason: "cost_unknown" });
  }
  if (estimate !== null && estimate > cap) {
    refused.push({ check: "cap", reason: `estimate_above_cap:${cap}` });
  }
  const committed = request.alreadyCommittedUsd ?? 0;
  if (estimate !== null && committed + estimate > cap) {
    refused.push({ check: "run_limit", reason: `run_limit_exceeded:${cap}` });
  }
  if (request.balanceMicrodollars === null || request.balanceMicrodollars === undefined) {
    refused.push({ check: "balance", reason: "balance_not_checked" });
  } else if (estimate !== null && request.balanceMicrodollars < Math.ceil(estimate * 1_000_000)) {
    refused.push({ check: "balance", reason: "insufficient_balance" });
  }

  const display =
    estimate === null
      ? "التكلفة غير معروفة لهذا النموذج، فلا يمكن عرض تقدير."
      : `التقدير ${estimate.toFixed(2)} دولار (${request.model.pricingNote ?? `${request.model.basePriceUsd} دولار لكل ${request.model.priceUnit === "second" ? "ثانية" : "مخرج"}`}). الحد المسموح ${cap.toFixed(2)} دولار.`;

  return { allowed: refused.length === 0, estimatedUsd: estimate, capUsd: cap, display, refused };
}

/**
 * Shapes a job row for the approval screen: what will run, on whose behalf, and for how much.
 *
 * Kept separate from the decision so the UI can show a cost and an approval request that do not depend on
 * the wallet being readable at that moment.
 */
export function approvalSummary(input: {
  organizationId: string;
  userId: string;
  capability: "image_generate" | "video_generate";
  modelId: string;
  estimateUsd: number | null;
}) {
  const capability =
    input.capability === "video_generate" ? "توليد فيديو بالذكاء الاصطناعي" : "توليد صورة بالذكاء الاصطناعي";
  const cost = input.estimateUsd === null ? "تكلفة غير معروفة" : `${input.estimateUsd.toFixed(2)} دولار تقديرًا`;
  return {
    title: `${capability} — ${input.modelId}`,
    reason: `طلب ${capability} عبر RunComfy للنموذج ${input.modelId} بتكلفة ${cost}. الموافقة على هذه المهمة فقط.`,
    metadata: {
      organizationId: input.organizationId,
      requestedBy: input.userId,
      provider: "runcomfy-cloud",
      modelId: input.modelId,
      estimatedUsd: input.estimateUsd,
    },
  };
}
