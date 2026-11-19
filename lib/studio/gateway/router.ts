import "server-only";

import { paidGenerationEnabled, spendCapUsd } from "../paid-switch";
import {
  gatewayProviders,
  type GatewayCapability,
  type GatewayCost,
  type GatewayProvider,
  type ModelOffer,
} from "./providers";

/**
 * Choosing a provider, in the order the owner specified: capability, model, credential, health, cost,
 * budget, speed, preference.
 *
 * The rule that shapes the whole file: a requested model is never quietly swapped. If the customer asks
 * for a specific model and no ready provider offers exactly that id, the answer is a refusal that names
 * it, not a cheaper model that produces a different picture and a different invoice.
 *
 * Tier order is the money rule: a local engine answers first, then the owner's own hardware, then a paid
 * cloud provider. A paid provider additionally needs the operator switch on and this job approved.
 */

export type RouteRequest = {
  capability: GatewayCapability;
  env?: Record<string, string | undefined>;
  /** The exact model the customer asked for, when they named one. */
  requestedModel?: string | null;
  units?: { outputs?: number; seconds?: number };
  /** The most this job may cost. Defaults to the configured cap. */
  budgetUsd?: number;
  /** The provider the customer prefers, honoured only among the candidates that already qualify. */
  preferProvider?: string | null;
  approvalReference?: string | null;
  /** How much of the run's budget is already committed. */
  alreadyCommittedUsd?: number;
  /**
   * The provider set to route over. Defaults to the deployment's own registry; injected so the routing
   * rules can be tested against providers that behave in specified ways rather than against the internet.
   */
  providers?: GatewayProvider[];
};

export type RouteCandidate = {
  providerId: string;
  modelId: string;
  tier: GatewayProvider["tier"];
  cost: GatewayCost;
  executable: boolean;
};

export type RouteDecision = {
  capability: GatewayCapability;
  chosen: RouteCandidate | null;
  /** Every candidate that qualified, in the order it would be tried. */
  order: RouteCandidate[];
  refused: Array<{ providerId: string; modelId?: string; reason: string }>;
  /** The comparison the customer sees: provider, model, estimate. */
  comparison: Array<{ providerId: string; modelId: string; usd: number | null; note: string }>;
  reason: string;
};

const TIER_ORDER: Record<GatewayProvider["tier"], number> = { local: 0, self_hosted: 1, cloud: 2 };

export async function routeGeneration(request: RouteRequest): Promise<RouteDecision> {
  const env = request.env ?? process.env;
  const cap = spendCapUsd(env);
  const budget = request.budgetUsd ?? cap;
  const committed = request.alreadyCommittedUsd ?? 0;
  const paidAllowed = paidGenerationEnabled(env);
  const approved = Boolean(request.approvalReference?.trim());

  const refused: RouteDecision["refused"] = [];
  const candidates: Array<RouteCandidate & { order: number }> = [];

  const providers = (request.providers ?? gatewayProviders(env)).filter((provider) =>
    provider.capabilities.includes(request.capability)
  );
  if (providers.length === 0) {
    return {
      capability: request.capability,
      chosen: null,
      order: [],
      refused: [{ providerId: "*", reason: "no_provider_for_capability" }],
      comparison: [],
      reason: "no_provider_for_capability",
    };
  }

  for (const provider of providers) {
    const readiness = provider.readiness(env);
    if (!readiness.ready) {
      refused.push({ providerId: provider.id, reason: readiness.code });
      continue;
    }
    if (provider.paid && !paidAllowed) {
      refused.push({ providerId: provider.id, reason: "paid_generation_disabled" });
      continue;
    }
    if (provider.paid && !approved) {
      refused.push({ providerId: provider.id, reason: "approval_required" });
      continue;
    }

    let offers: ModelOffer[] = [];
    try {
      offers = await provider.listModels(request.capability, env);
    } catch (error) {
      refused.push({ providerId: provider.id, reason: provider.classify(error) });
      continue;
    }
    if (offers.length === 0) {
      refused.push({ providerId: provider.id, reason: "no_model_for_capability" });
      continue;
    }

    // An explicitly requested model must match exactly, or this provider is not a candidate.
    const usable = request.requestedModel
      ? offers.filter((offer) => offer.id === request.requestedModel)
      : offers;
    if (request.requestedModel && usable.length === 0) {
      refused.push({ providerId: provider.id, modelId: request.requestedModel, reason: "requested_model_not_offered" });
      continue;
    }

    const priced = usable
      .map((offer) => ({ offer, cost: provider.estimate(offer, request.units ?? {}) }))
      .filter((entry) => {
        if (entry.cost.usd === null) {
          refused.push({ providerId: provider.id, modelId: entry.offer.id, reason: "cost_unknown" });
          return false;
        }
        if (entry.cost.usd > budget) {
          refused.push({ providerId: provider.id, modelId: entry.offer.id, reason: `over_budget:${budget}` });
          return false;
        }
        if (committed + entry.cost.usd > budget) {
          refused.push({ providerId: provider.id, modelId: entry.offer.id, reason: `run_limit_exceeded:${budget}` });
          return false;
        }
        return true;
      })
      .map((entry) => ({
        providerId: provider.id,
        modelId: entry.offer.id,
        tier: provider.tier,
        cost: entry.cost,
        executable: provider.executable,
        order: TIER_ORDER[provider.tier] * 1000 + (entry.cost.usd ?? 0) * 100,
      }));

    candidates.push(...priced);
  }

  // Preference re-orders only among candidates that already qualified; it can never admit a refused one.
  const preferred = request.preferProvider;
  candidates.sort((a, b) => {
    if (preferred) {
      const aPref = a.providerId === preferred ? 0 : 1;
      const bPref = b.providerId === preferred ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
    }
    return a.order - b.order || a.modelId.localeCompare(b.modelId);
  });

  const ordered: RouteCandidate[] = candidates.map(({ order: _order, ...rest }) => rest);
  const chosen = ordered[0] ?? null;

  return {
    capability: request.capability,
    chosen,
    order: ordered,
    refused,
    comparison: ordered.map((candidate) => ({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      usd: candidate.cost.usd,
      note: candidate.cost.note,
    })),
    reason: chosen
      ? `${chosen.tier}_engine_selected`
      : refused.some((entry) => entry.reason === "approval_required")
        ? "approval_required"
        : refused.some((entry) => entry.reason === "paid_generation_disabled")
          ? "paid_generation_disabled"
          : "every_provider_refused",
  };
}
