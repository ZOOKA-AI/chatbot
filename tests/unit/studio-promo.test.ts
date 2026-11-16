import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/tenant-context", () => ({ commanderActiveDb: () => null }));

import { actionPayload, findAction, matchActionsForRequest } from "@/lib/actions/catalog";
import { studioPromoVideo } from "@/lib/agents/worker-tools/studio-promo";

/**
 * The promo action, from the sentence to the payload to the refusals.
 *
 * The scenario the directive names is one Arabic sentence asking for a film, a voice and a logo.
 * What matters is that the sentence routes to the action that actually produces all three, that a
 * plain film request does not get hijacked, and that the tool refuses bad input before it starts
 * ffmpeg or touches a database.
 */

const REQUEST = "اعمل فيديو ترويجي قصير بتعليق عربي ولوجو شركتي";

describe("one Arabic sentence reaches the promo composition", () => {
  test("the directive's sentence selects the promo action", () => {
    assert.deepEqual(matchActionsForRequest(REQUEST), ["studio_promo_video"]);
  });

  test("the promo action is executable, because its tool is registered", () => {
    const action = findAction("studio_promo_video");
    assert.ok(action, "the action exists");
    assert.equal(action?.executable, true);
    assert.equal(action?.approval, "none", "composition is reversible and publishes nothing");
  });

  test("a film with no voice and no logo still goes to the plain renderer", () => {
    assert.deepEqual(matchActionsForRequest("اعمل فيديو من صوري"), ["studio_video_render"]);
  });

  test("a voice on its own is narration, not a film", () => {
    assert.deepEqual(matchActionsForRequest("أضف تعليق صوتي لهذا النص"), ["studio_narration"]);
  });

  test("a logo on an image is an image edit", () => {
    assert.deepEqual(matchActionsForRequest("ضع اللوجو على الصورة"), ["studio_image_edit"]);
  });
});

describe("the payload is built from the form, not guessed", () => {
  test("scene titles split on commas and a colon becomes a subtitle", () => {
    const template = findAction("studio_promo_video")!;
    const { tool, payload } = actionPayload(template, {
      script: "شركة تنظيف في الإمارات، جودة تستحق الثقة.",
      scenes: "خدمات تنظيف احترافية، فريق موثوق: خبرة سنوات، احجز الآن",
      logo: "لوجو",
      aspect: "9:16",
    });
    assert.equal(tool, "studio_promo_video");
    assert.equal(payload.script, "شركة تنظيف في الإمارات، جودة تستحق الثقة.");
    assert.deepEqual(payload.scenes, [
      { title: "خدمات تنظيف احترافية", subtitle: null },
      { title: "فريق موثوق", subtitle: "خبرة سنوات" },
      { title: "احجز الآن", subtitle: null },
    ]);
    assert.equal(payload.logo, "لوجو");
    assert.equal(payload.aspect, "9:16");
  });

  test("the default aspect is 9:16 when the customer leaves it blank", () => {
    const template = findAction("studio_promo_video")!;
    const { payload } = actionPayload(template, { script: "نص عربي كافٍ", scenes: "مشهد" });
    assert.equal(payload.aspect, "9:16");
  });
});

describe("the tool refuses before it spends anything", () => {
  const context = (payload: Record<string, unknown>) => ({
    organizationId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent",
    taskId: null,
    payload,
    signal: new AbortController().signal,
  });

  test("with no scenes it says so, before synthesising or rendering", async () => {
    const result = await studioPromoVideo.run(context({ script: "نص عربي كافٍ للتعليق الصوتي" }) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "no_scenes");
  });

  test("a Latin-only script is refused, because the voice is Arabic", async () => {
    const result = await studioPromoVideo.run(
      context({ script: "This is English narration text", scenes: [{ title: "مشهد" }] }) as never
    );
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "not_arabic");
  });

  test("a script that is too short is refused with its own reason", async () => {
    const result = await studioPromoVideo.run(context({ script: "قصير", scenes: [{ title: "مشهد" }] }) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "script_too_short");
  });

  test("too many scenes is refused rather than truncated", async () => {
    const scenes = Array.from({ length: 7 }, (_, index) => ({ title: `مشهد ${index + 1}` }));
    const result = await studioPromoVideo.run(
      context({ script: "شركة تنظيف في الإمارات جودة تستحق الثقة", scenes }) as never
    );
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "too_many_scenes");
  });
});
