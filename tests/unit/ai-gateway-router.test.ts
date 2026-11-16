import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GatewayProvider, ModelOffer } from "@/lib/studio/gateway/providers";
import { routeGeneration } from "@/lib/studio/gateway/router";

/**
 * The routing rules, tested as rules.
 *
 * Providers are injected rather than fetched, so each test states a provider's behaviour and asserts what
 * the gateway does with it. The real adapters are covered in ai-gateway-adapters.test.ts. What is proven
 * here is the policy: local first, paid only with a switch and an approval, priced before chosen, inside
 * the budget, and never a substituted model.
 */

function fakeProvider(spec: {
  id: string;
  tier: GatewayProvider["tier"];
  paid: boolean;
  capabilities: GatewayProvider["capabilities"];
  ready?: boolean;
  code?: string;
  offers?: ModelOffer[];
  failure?: { code: string } | null;
}): GatewayProvider {
  return {
    id: spec.id,
    tier: spec.tier,
    paid: spec.paid,
    executable: true,
    capabilities: spec.capabilities,
    readiness: () =>
      spec.ready === false
        ? { ready: false, code: (spec.code ?? "credential_missing") as never, detail: spec.code ?? "missing" }
        : { ready: true, code: "ready", detail: "ok" },
    listModels: async () => {
      if (spec.failure) throw Object.assign(new Error("boom"), { code: spec.failure.code });
      return spec.offers ?? [];
    },
    estimate: (offer, units) =>
      offer.priceUsd === null
        ? { usd: null, kind: "unknown" as const, note: "no rate published" }
        : { usd: offer.priceUsd * Math.max(1, units.outputs ?? 1), kind: "estimated" as const, note: "test rate" },
    submit: async () => ({ providerId: spec.id, modelId: "m", jobId: "j", handle: null }),
    status: async () => ({ state: "completed" as const, position: null, detail: null }),
    result: async () => ({ url: null, raw: null, providerCostUsd: null }),
    cancel: async () => false,
    classify: (error: unknown) => (error as { code?: string })?.code ?? "provider_error",
  };
}

const offer = (id: string, priceUsd: number | null): ModelOffer => ({
  id,
  label: id,
  capabilities: ["image_generate"],
  priceUsd,
  priceUnit: "output",
  source: "live_catalog",
});

const local = () =>
  fakeProvider({
    id: "local-engines",
    tier: "local",
    paid: false,
    capabilities: ["image_edit", "video_render"],
    // A local engine is free, so it is priced at zero rather than left unpriced.
    offers: [{ ...offer("local:image_edit", 0), capabilities: ["image_edit"] }],
  });
const comfy = () =>
  fakeProvider({ id: "comfyui", tier: "self_hosted", paid: false, capabilities: ["image_generate"], ready: false, code: "endpoint_missing" });
const runcomfy = (offers = [offer("runcomfy/cheap", 0.06), offer("runcomfy/pricey", 0.5)]) =>
  fakeProvider({ id: "runcomfy-cloud", tier: "cloud", paid: true, capabilities: ["image_generate"], offers });
const fal = (offers: ModelOffer[]) =>
  fakeProvider({ id: "fal-cloud", tier: "cloud", paid: true, capabilities: ["image_generate"], offers });

const PAID_ON = { PAID_GENERATION_ENABLED: "true" };
const APPROVED = { approvalReference: "approval-1" };

describe("the ladder decides, in the owner's order", () => {
  test("a local capability never reaches a cloud provider", async () => {
    const decision = await routeGeneration({
      capability: "image_edit",
      env: PAID_ON,
      providers: [local(), runcomfy()],
      ...APPROVED,
    });
    assert.equal(decision.chosen?.providerId, "local-engines");
  });

  test("a self-hosted instance with no endpoint is reported as unavailable, not ignored", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [comfy(), runcomfy()],
      ...APPROVED,
    });
    assert.equal(decision.chosen?.providerId, "runcomfy-cloud");
    assert.ok(decision.refused.some((entry) => entry.providerId === "comfyui" && entry.reason === "endpoint_missing"));
  });

  test("paid generation off refuses every paid provider", async () => {
    const decision = await routeGeneration({ capability: "image_generate", env: {}, providers: [comfy(), runcomfy()] });
    assert.equal(decision.chosen, null);
    assert.equal(decision.reason, "paid_generation_disabled");
  });

  test("a token without an approval is refused as an approval problem", async () => {
    const decision = await routeGeneration({ capability: "image_generate", env: PAID_ON, providers: [runcomfy()] });
    assert.equal(decision.chosen, null);
    assert.equal(decision.reason, "approval_required");
  });

  test("with switch and approval the cheapest priced model is chosen, and the comparison is ordered", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      ...APPROVED,
    });
    assert.equal(decision.chosen?.modelId, "runcomfy/cheap");
    assert.equal(decision.chosen?.cost.usd, 0.06);
    assert.deepEqual(decision.comparison.map((entry) => entry.modelId), ["runcomfy/cheap", "runcomfy/pricey"]);
  });
});

describe("a requested model is never swapped", () => {
  test("an unavailable requested model is refused by name, and nothing is substituted", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      requestedModel: "someone/else-model",
      ...APPROVED,
    });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason === "requested_model_not_offered"));
    assert.equal(decision.order.length, 0);
  });

  test("a requested model that is offered is chosen verbatim, even when it is the dearer one", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      requestedModel: "runcomfy/pricey",
      ...APPROVED,
    });
    assert.equal(decision.chosen?.modelId, "runcomfy/pricey");
    assert.equal(decision.chosen?.cost.usd, 0.5);
  });
});

describe("money is respected before a provider is chosen", () => {
  test("a requested model above the budget is refused rather than downgraded", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      requestedModel: "runcomfy/pricey",
      budgetUsd: 0.1,
      ...APPROVED,
    });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason.startsWith("over_budget")));
  });

  test("without a requested model the budget keeps the affordable one and refuses the rest", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      budgetUsd: 0.1,
      ...APPROVED,
    });
    assert.equal(decision.chosen?.modelId, "runcomfy/cheap");
    assert.ok(decision.refused.some((entry) => entry.modelId === "runcomfy/pricey" && entry.reason.startsWith("over_budget")));
  });

  test("an unpriced model is a refusal, never a zero", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy([offer("runcomfy/unpriced", null)])],
      ...APPROVED,
    });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason === "cost_unknown"));
  });

  test("the running limit blocks a job that would pass the cap", async () => {
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy()],
      budgetUsd: 0.2,
      alreadyCommittedUsd: 0.18,
      ...APPROVED,
    });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason.startsWith("run_limit_exceeded")));
  });
});

describe("outages and preference", () => {
  test("a provider that fails discovery is refused without breaking the others", async () => {
    const broken = fakeProvider({
      id: "runcomfy-cloud",
      tier: "cloud",
      paid: true,
      capabilities: ["image_generate"],
      failure: { code: "provider_unavailable" },
    });
    const decision = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [broken, fal([offer("fal-ai/x", 0.02)])],
      ...APPROVED,
    });
    assert.equal(decision.chosen?.providerId, "fal-cloud");
    assert.ok(decision.refused.some((entry) => entry.providerId === "runcomfy-cloud" && entry.reason === "provider_unavailable"));
  });

  test("preference reorders qualified candidates but cannot admit a refused provider", async () => {
    const preferred = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [runcomfy(), fal([offer("fal-ai/x", 0.02)])],
      preferProvider: "fal-cloud",
      ...APPROVED,
    });
    assert.equal(preferred.chosen?.providerId, "fal-cloud");

    const refusedPreference = await routeGeneration({
      capability: "image_generate",
      env: PAID_ON,
      providers: [
        runcomfy(),
        fakeProvider({ id: "fal-cloud", tier: "cloud", paid: true, capabilities: ["image_generate"], ready: false }),
      ],
      preferProvider: "fal-cloud",
      ...APPROVED,
    });
    assert.equal(refusedPreference.chosen?.providerId, "runcomfy-cloud");
  });

  test("a capability nobody offers is refused as such", async () => {
    const decision = await routeGeneration({ capability: "narration", env: {}, providers: [runcomfy()] });
    assert.equal(decision.chosen, null);
    assert.equal(decision.reason, "no_provider_for_capability");
  });
});
