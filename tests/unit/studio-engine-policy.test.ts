import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  LEVEL_ONE_CAPABILITIES,
  engineRegistry,
  levelOneSelfSufficient,
  paidPolicy,
  selectEngine,
  type Env,
} from "@/lib/studio/engine-policy";

/**
 * The policy that keeps a vendor out of the product's critical path.
 *
 * These tests are about refusals, because a policy that only describes what works is not a policy. The
 * cases that matter: a paid engine cannot run on a flag alone, a paid engine cannot run on an approval
 * alone, and the platform's own five capabilities are decided locally in every configuration tested,
 * including one with nothing configured and one where the generation endpoint is broken.
 */

const EMPTY: Env = {};
const READY_LOCAL: Env = { STUDIO_PIPER_VOICE: "/voices/ar_JO-kareem-medium.onnx" };
const COMFY: Env = {
  ...READY_LOCAL,
  COMFYUI_ENDPOINT: "http://gpu.internal:8188",
  COMFYUI_WORKFLOW_FILE: "/workflows/txt2img.json",
};

describe("the platform's own work never depends on a provider", () => {
  test("every level-one capability resolves to a local engine with nothing configured", () => {
    const result = levelOneSelfSufficient(READY_LOCAL);
    assert.equal(result.ok, true, `gaps: ${result.gaps.join(",")}`);
    assert.deepEqual(result.gaps, []);
  });

  test("narration alone reports its gap when no voice is installed, and nothing else does", () => {
    const result = levelOneSelfSufficient(EMPTY);
    assert.deepEqual(result.gaps, ["narration"], "only the voice-backed capability is missing");
  });

  test("a configured generation endpoint changes no level-one decision", () => {
    for (const capability of LEVEL_ONE_CAPABILITIES) {
      const withoutComfy = selectEngine({ capability, env: READY_LOCAL });
      const withComfy = selectEngine({ capability, env: COMFY });
      assert.deepEqual(withComfy, withoutComfy, `${capability} must not change when a GPU appears`);
    }
  });

  test("a broken generator does not stop editing, cutting out, rendering or narrating", () => {
    // An endpoint that is configured but wrong is the realistic failure: the host moved, the URL rotted.
    const broken: Env = {
      ...READY_LOCAL,
      COMFYUI_ENDPOINT: "http://decommissioned.internal:8188",
      COMFYUI_WORKFLOW_FILE: "/workflows/txt2img.json",
    };
    assert.equal(levelOneSelfSufficient(broken).ok, true);
    assert.equal(selectEngine({ capability: "image_edit", env: broken }).chosen, "local-ffmpeg");
  });
});

describe("preference order is local, then self-hosted, then paid", () => {
  test("editing is served locally even when everything else is available", () => {
    const decision = selectEngine({ capability: "image_edit", env: COMFY });
    assert.equal(decision.chosen, "local-ffmpeg");
    assert.equal(decision.tier, "local");
    assert.equal(decision.reason, "local_engine_available");
  });

  test("generation prefers the owner's instance over a rented one", () => {
    const decision = selectEngine({
      capability: "image_generate",
      env: { ...COMFY, STUDIO_ALLOW_PAID_PROVIDERS: "1", STUDIO_CLOUD_GPU_ENDPOINT: "https://gpu.example/v1", STUDIO_PAID_APPROVAL_REF: "APR-1" },
      approvalReference: "APR-1",
    });
    assert.equal(decision.chosen, "comfyui");
    assert.equal(decision.tier, "self_hosted");
  });
});

describe("a paid engine needs a flag and an approval, not one of them", () => {
  const PAID_ENV: Env = {
    ...READY_LOCAL,
    STUDIO_CLOUD_GPU_ENDPOINT: "https://gpu.example/v1",
  };

  test("with no flag it is refused, whatever the endpoint", () => {
    const decision = selectEngine({ capability: "image_generate", env: PAID_ENV });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason === "paid_provider_not_enabled"));
  });

  test("with the flag but no approval it is still refused", () => {
    const decision = selectEngine({
      capability: "image_generate",
      env: { ...PAID_ENV, STUDIO_ALLOW_PAID_PROVIDERS: "1" },
    });
    assert.equal(decision.chosen, null);
    assert.ok(decision.refused.some((entry) => entry.reason === "paid_provider_not_approved"));
    assert.equal(decision.reason, "every_engine_refused");
  });

  test("an approval header that is blank is not an approval", () => {
    const decision = selectEngine({
      capability: "image_generate",
      env: { ...PAID_ENV, STUDIO_ALLOW_PAID_PROVIDERS: "1" },
      approvalReference: "   ",
    });
    assert.equal(decision.chosen, null);
  });

  test("flag and approval together allow it, and the cheaper refusal is still reported", () => {
    const decision = selectEngine({
      capability: "image_generate",
      env: { ...PAID_ENV, STUDIO_ALLOW_PAID_PROVIDERS: "1" },
      approvalReference: "APR-2026-11-16",
    });
    assert.equal(decision.chosen, "cloud-gpu");
    assert.equal(decision.tier, "paid_api");
    // The owner's own instance was examined first and had nothing configured, so it is reported:
    // choosing the paid engine does not erase the fact that a free one was unavailable. RunComfy is
    // reported too, because it was considered and refused for want of a token rather than skipped.
    assert.deepEqual(decision.refused, [
      { engine: "comfyui", reason: "not_configured" },
      { engine: "cloudflare-workers-ai", reason: "not_configured" },
      { engine: "ovhcloud-sdxl", reason: "not_configured" },
      { engine: "runcomfy-cloud", reason: "paid_provider_not_configured" },
    ]);
  });

  test("the flag comes from the environment, and the default is off", () => {
    assert.equal(paidPolicy({}).enabled, false);
    assert.equal(paidPolicy({ STUDIO_ALLOW_PAID_PROVIDERS: "true" }).enabled, false, "only \"1\" enables it");
    assert.equal(paidPolicy({ STUDIO_ALLOW_PAID_PROVIDERS: "1" }).enabled, true);
  });
});

describe("what the matrix says when nothing can answer", () => {
  test("generation with no endpoint and no paid access names every refusal", () => {
    const decision = selectEngine({ capability: "image_generate", env: EMPTY });
    assert.equal(decision.chosen, null);
    // Self-hosted refused for configuration, then both paid engines refused for the switch. The order
    // is the ladder's own: cheaper and more local is examined first.
    assert.deepEqual(
      decision.refused.map((entry) => `${entry.engine}:${entry.reason}`),
      [
        "comfyui:not_configured",
        "cloudflare-workers-ai:not_configured",
        "ovhcloud-sdxl:not_configured",
        "runcomfy-cloud:paid_provider_not_enabled",
        "cloud-gpu:paid_provider_not_enabled",
      ]
    );
  });

  test("a capability no engine offers is refused as such, not as a configuration problem", () => {
    // The registry has no voice-cloning engine, and this proves the absence is stated plainly.
    const decision = selectEngine({ capability: "image_generate", env: { ...EMPTY, STUDIO_CLOUD_GPU_ENDPOINT: "x", STUDIO_ALLOW_PAID_PROVIDERS: "1", STUDIO_PAID_APPROVAL_REF: "A" } });
    assert.equal(decision.chosen, "cloud-gpu");
    const none = engineRegistry(EMPTY).filter((engine) => engine.capabilities.includes("video_render"));
    assert.equal(none.length, 1, "only the local renderer offers rendering");
    assert.equal(none[0].tier, "local");
  });
});
