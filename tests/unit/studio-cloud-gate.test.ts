import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { decideSpend, estimateCostUsd, paidGenerationEnabled, spendCapUsd } from "@/lib/studio/cloud-cost";
import { engineRegistry, selectEngine } from "@/lib/studio/engine-policy";

/**
 * The spend gate, and the ladder it sits in.
 *
 * The owner's rule is that an API token is not permission to spend. These tests hold that line: every
 * combination short of all five conditions refuses, the default configuration spends nothing, and a paid
 * provider never outranks a local answer.
 */

const MODEL = { modelId: "blackforestlabs/flux-1-kontext/dev/image-to-image", basePriceUsd: 0.06, priceUnit: "output" as const, pricingNote: "$0.06 per image" };
const FULL_ENV = {
  PAID_GENERATION_ENABLED: "true",
  RUNCOMFY_API_TOKEN: "rc_test_only",
  RUNCOMFY_MAX_SPEND_USD: "0.2",
};

const request = (overrides: Record<string, unknown> = {}) => ({
  organizationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  capability: "image_generate" as const,
  model: MODEL,
  outputs: 1,
  approvalReference: "approval-1",
  balanceMicrodollars: 500_000,
  ...overrides,
});

describe("cost is estimated from the documented pricing model", () => {
  test("a per-output model multiplies by the number of outputs", () => {
    assert.equal(estimateCostUsd(MODEL, { outputs: 3 }), 0.18);
  });

  test("a per-second model needs a duration, and refuses to guess one", () => {
    const perSecond = { basePriceUsd: 0.02, priceUnit: "second" as const };
    assert.equal(estimateCostUsd(perSecond, { seconds: 10 }), 0.2);
    assert.equal(estimateCostUsd(perSecond, {}), null);
  });

  test("an unknown unit or price yields null, which is a refusal and never a zero", () => {
    assert.equal(estimateCostUsd({ basePriceUsd: null, priceUnit: "output" }, { outputs: 1 }), null);
    assert.equal(estimateCostUsd({ basePriceUsd: 0.1, priceUnit: null }, {}), null);
  });
});

describe("nothing is spent unless all five conditions hold", () => {
  test("the shipped default spends nothing", () => {
    assert.equal(paidGenerationEnabled({}), false);
    const decision = decideSpend(request(), {});
    assert.equal(decision.allowed, false);
    assert.ok(decision.refused.some((entry) => entry.reason === "paid_generation_disabled"));
  });

  test("an enabled switch without an approval is still refused", () => {
    const decision = decideSpend(request({ approvalReference: null }), FULL_ENV);
    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.refused.map((entry) => entry.reason), ["approval_required"]);
  });

  test("an approval with no wallet check is refused", () => {
    const decision = decideSpend(request({ balanceMicrodollars: null }), FULL_ENV);
    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.refused.map((entry) => entry.reason), ["balance_not_checked"]);
  });

  test("an estimate above the cap is refused, and the cap is quoted", () => {
    const decision = decideSpend(request({ outputs: 4 }), FULL_ENV); // 0.24 > 0.2
    assert.equal(decision.allowed, false);
    assert.ok(decision.refused.some((entry) => entry.reason.startsWith("estimate_above_cap")));
  });

  test("the running limit refuses a second job that would pass the cap", () => {
    const decision = decideSpend(request({ alreadyCommittedUsd: 0.18 }), FULL_ENV); // 0.18 + 0.06 > 0.2
    assert.equal(decision.allowed, false);
    assert.ok(decision.refused.some((entry) => entry.reason.startsWith("run_limit_exceeded")));
  });

  test("an empty wallet is refused even when everything else is right", () => {
    const decision = decideSpend(request({ balanceMicrodollars: 10_000 }), FULL_ENV); // $0.01
    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.refused.map((entry) => entry.reason), ["insufficient_balance"]);
  });

  test("with all five satisfied the job is allowed, with a cost the customer can read", () => {
    const decision = decideSpend(request(), FULL_ENV);
    assert.equal(decision.allowed, true);
    assert.equal(decision.estimatedUsd, 0.06);
    assert.equal(decision.capUsd, 0.2);
    assert.ok(decision.display.includes("0.06"));
  });

  test("the cap has a conservative default when unset", () => {
    assert.equal(spendCapUsd({}), 0.5);
  });
});

describe("the ladder puts local first and the paid cloud last", () => {
  test("editing never reaches a paid engine, even when one is fully configured", () => {
    const decision = selectEngine({ capability: "image_edit", env: FULL_ENV, approvalReference: "approval-1" });
    assert.equal(decision.tier, "local");
    assert.equal(decision.chosen, "local-ffmpeg");
  });

  test("image generation refuses without a token, naming the provider", () => {
    const decision = selectEngine({ capability: "image_generate", env: { PAID_GENERATION_ENABLED: "true" }, approvalReference: "a" });
    assert.equal(decision.chosen, null);
    const runcomfy = decision.refused.find((entry) => entry.engine === "runcomfy-cloud");
    assert.equal(runcomfy?.reason, "paid_provider_not_configured");
  });

  test("a token alone does not select it: the operator switch and an approval are both required", () => {
    const tokenOnly = selectEngine({ capability: "image_generate", env: { RUNCOMFY_API_TOKEN: "rc_test_only" }, approvalReference: "a" });
    assert.equal(tokenOnly.chosen, null);
    assert.ok(tokenOnly.refused.some((entry) => entry.reason === "paid_provider_not_enabled"));

    const noApproval = selectEngine({ capability: "image_generate", env: { ...FULL_ENV, PAID_GENERATION_ENABLED: "true" }, approvalReference: null });
    assert.equal(noApproval.chosen, null);
    assert.ok(noApproval.refused.some((entry) => entry.reason === "paid_provider_not_approved"));

    const approved = selectEngine({ capability: "image_generate", env: FULL_ENV, approvalReference: "a" });
    assert.equal(approved.chosen, "runcomfy-cloud");
    assert.equal(approved.tier, "paid_api");
  });

  test("video generation has no local answer, so it can only ever be the cloud provider", () => {
    const withoutToken = selectEngine({ capability: "video_generate", env: {}, approvalReference: "a" });
    assert.equal(withoutToken.chosen, null);
    assert.equal(withoutToken.reason, "every_engine_refused");

    const withToken = selectEngine({ capability: "video_generate", env: FULL_ENV, approvalReference: "a" });
    assert.equal(withToken.chosen, "runcomfy-cloud");
  });

  test("RunComfy outranks the generic rented-GPU declaration when both are set", () => {
    const env = { ...FULL_ENV, STUDIO_CLOUD_GPU_ENDPOINT: "https://gpu.example" };
    const decision = selectEngine({ capability: "image_generate", env, approvalReference: "a" });
    assert.equal(decision.chosen, "runcomfy-cloud");
  });

  test("the registry declares no capability ZOOKA cannot actually serve", () => {
    const ids = engineRegistry({}).map((engine) => engine.id);
    assert.ok(ids.includes("runcomfy-cloud"));
    const runcomfy = engineRegistry({}).find((engine) => engine.id === "runcomfy-cloud")!;
    assert.equal(runcomfy.paid, true);
    assert.deepEqual(runcomfy.capabilities.sort(), ["image_generate", "video_generate"]);
  });
});
