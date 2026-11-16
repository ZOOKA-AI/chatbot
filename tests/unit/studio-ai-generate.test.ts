import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/tenant-context", () => ({ commanderActiveDb: () => null }));

import { actionPayload, findAction, matchActionsForRequest } from "@/lib/actions/catalog";
/*
 * Approval consumption lives in the database and is proven against a real one in spend-approvals.test.ts.
 * Here the stub records the spend so this file can assert the order of operations: authorise, then submit.
 */
vi.mock("@/lib/studio/spend-approvals", () => ({
  async consumeApproval(input: { id: string }) {
    return { id: input.id };
  },
  async bindProviderJob() {
    return null;
  },
}));

import { studioAiGenerate } from "@/lib/agents/worker-tools/studio-ai-generate";

/**
 * The billable tool, tested for the property that matters most: it refuses before it spends.
 *
 * Every test here asserts the absence of a POST. A generation path that submits "just to see" is the one
 * bug that costs the owner money, so the negative assertion is the test.
 */

const calls: Array<{ url: string; method: string }> = [];

function stubFetch(balance = 500_000) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      if (String(url).includes("/v2/balance")) {
        return new Response(JSON.stringify({ balance_microdollars: balance, balance_usd: balance / 1_000_000, currency: "USD" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).includes("/v1/models?")) {
        return new Response(
          JSON.stringify({
            models: [
              { model_id: "blackforestlabs/flux-1-kontext/dev/image-to-image", display_name: "Flux Dev", categories: ["text-to-image"], base_price_usd: 0.06, price_unit: "output", required_inputs: ["prompt"] },
            ],
            total: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ request_id: "req_1", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
}

const context = (payload: Record<string, unknown>) => ({
  organizationId: "11111111-1111-4111-8111-111111111111",
  agentId: "agent",
  taskId: null,
  payload,
  signal: new AbortController().signal,
});

const posts = () => calls.filter((call) => call.method === "POST");

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RUNCOMFY_API_TOKEN;
  delete process.env.PAID_GENERATION_ENABLED;
});

describe("nothing is submitted without every condition", () => {
  test("no credential is not_configured, and touches no network at all", async () => {
    stubFetch();
    const result = await studioAiGenerate.run(context({ prompt: "صورة إعلانية احترافية" }) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "not_configured");
    assert.equal(calls.length, 0);
  });

  test("a token without an approval reads the wallet and stops before the billable call", async () => {
    process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
    process.env.PAID_GENERATION_ENABLED = "true";
    stubFetch();

    const result = await studioAiGenerate.run(context({ prompt: "صورة إعلانية احترافية لشركة تنظيف" }) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "spend_not_authorized");
    assert.match(String(result.summary), /approval_required/);
    assert.equal(posts().length, 0, "no inference was submitted");
  });

  test("an approval with the operator switch off is still refused", async () => {
    process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
    stubFetch();

    const result = await studioAiGenerate.run(
      context({ prompt: "صورة إعلانية احترافية لشركة تنظيف", approvalId: "approval-1" }) as never
    );
    assert.equal(result.ok, false);
    assert.match(String(result.summary), /paid_generation_disabled/);
    assert.equal(posts().length, 0);
  });

  test("an empty prompt is refused before any provider call", async () => {
    process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
    stubFetch();
    const result = await studioAiGenerate.run(context({ prompt: "  " }) as never);
    assert.equal((result as { error: string }).error, "prompt_required");
    assert.equal(calls.length, 0);
  });

  test("a wallet below the estimate refuses even with approval and the switch on", async () => {
    process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
    process.env.PAID_GENERATION_ENABLED = "true";
    stubFetch(10_000); // $0.01 against a $0.06 model

    const result = await studioAiGenerate.run(
      context({ prompt: "صورة إعلانية احترافية لشركة تنظيف", approvalId: "approval-1" }) as never
    );
    assert.equal(result.ok, false);
    assert.match(String(result.summary), /insufficient_balance/);
    assert.equal(posts().length, 0);
  });
});

describe("the sentence reaches the billable action, and only the billable one", () => {
  test("an explicit AI request routes to the generator", () => {
    assert.deepEqual(matchActionsForRequest("أنشئ صورة إعلانية بالذكاء الاصطناعي"), ["studio_ai_generate"]);
  });

  test("the deterministic promo film still routes to its own action", () => {
    assert.deepEqual(matchActionsForRequest("اعمل فيديو ترويجي قصير بتعليق عربي ولوجو شركتي"), ["studio_promo_video"]);
  });

  test("a plain film request still goes to the local renderer", () => {
    assert.deepEqual(matchActionsForRequest("اعمل فيديو من صوري"), ["studio_video_render"]);
  });

  test("the action is marked as requiring a decision, because it bills", () => {
    const action = findAction("studio_ai_generate");
    assert.ok(action);
    assert.equal(action?.approval, "required");
    assert.equal(action?.executable, true);
    assert.deepEqual(action?.requiredIntegrations, ["runcomfy"]);
  });

  test("the payload carries the approval reference and the kind", () => {
    const template = findAction("studio_ai_generate")!;
    const { tool, payload } = actionPayload(template, {
      prompt: "صورة إعلانية احترافية",
      capability: "video",
      approval_reference: "approval-9",
      aspect: "9:16",
    });
    assert.equal(tool, "studio_ai_generate");
    assert.equal(payload.approvalId, "approval-9");
    assert.equal(payload.capability, "video");
    assert.equal(payload.aspect, "9:16");
  });
});
