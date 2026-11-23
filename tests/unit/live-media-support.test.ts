import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

import {
  detectMediaSupport,
  getDisplayMediaCompat,
  getUserMediaCompat,
  supportNotice,
} from "@/lib/live/media-support";

/**
 * The live session must work on every browser that can capture, and say plainly what cannot work on
 * the ones that cannot. These user agents are the real strings of the browsers in question.
 */

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge18:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.17763",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
};

const stream = { id: "s" } as unknown as MediaStream;
const userMediaOnly = () => ({ getUserMedia: vi.fn(async () => stream) });
const full = () => ({ getUserMedia: vi.fn(async () => stream), getDisplayMedia: vi.fn(async () => stream) });

describe("what each browser can do", () => {
  test("Chrome and Samsung on Android: mic and camera yes, screen no, with an Android-specific notice", () => {
    for (const userAgent of [UA.androidChrome, UA.samsung]) {
      const support = detectMediaSupport({ userAgent, mediaDevices: userMediaOnly() }, true);
      assert.deepEqual(
        { platform: support.platform, mic: support.microphone, cam: support.camera, screen: support.screen },
        { platform: "android", mic: true, cam: true, screen: false }
      );
      assert.match(supportNotice(support, "ar") ?? "", /أندرويد.*الصوت والكاميرا يعملان/);
    }
  });

  test("Safari on iPhone before 27, and iPadOS posing as a Mac: an iOS notice naming iOS 27", () => {
    const iphone = detectMediaSupport({ userAgent: UA.iphoneSafari, mediaDevices: userMediaOnly() }, true);
    const ipad = detectMediaSupport({ userAgent: UA.ipadOs, maxTouchPoints: 5, mediaDevices: userMediaOnly() }, true);
    for (const support of [iphone, ipad]) {
      assert.equal(support.platform, "ios");
      assert.equal(support.screen, false);
      assert.match(supportNotice(support, "en") ?? "", /iOS 27/);
    }
  });

  test("a desktop browser with everything shows no notice", () => {
    const support = detectMediaSupport({ userAgent: UA.desktopChrome, mediaDevices: full() }, true);
    assert.equal(support.screen && support.camera && support.microphone, true);
    assert.equal(supportNotice(support, "ar"), null);
  });

  test("Edge 18's pre-standard navigator.getDisplayMedia counts as screen support and is used", async () => {
    const legacy = vi.fn(async () => stream);
    const nav = { userAgent: UA.edge18, mediaDevices: userMediaOnly(), getDisplayMedia: legacy };
    assert.equal(detectMediaSupport(nav, true).screen, true);
    assert.equal(await getDisplayMediaCompat(nav, { video: true }), stream);
    assert.equal(legacy.mock.calls.length, 1);
  });

  test("an insecure page cannot capture anything, and says https", () => {
    const support = detectMediaSupport({ userAgent: UA.desktopChrome, mediaDevices: full() }, false);
    assert.equal(support.microphone || support.camera || support.screen, false);
    assert.match(supportNotice(support, "en") ?? "", /https/);
  });

  test("an in-app browser without capture is told to open Chrome or Safari", () => {
    const support = detectMediaSupport({ userAgent: UA.instagram }, true);
    assert.equal(support.inAppBrowser, true);
    assert.equal(support.camera, false);
    assert.match(supportNotice(support, "ar") ?? "", /Chrome أو Safari/);
  });
});

describe("capture on every engine that can", () => {
  test("only the legacy prefixed webkitGetUserMedia: still captures through the callback API", async () => {
    const webkitGetUserMedia = vi.fn((_c: MediaStreamConstraints, ok: (s: MediaStream) => void) => ok(stream));
    const nav = { userAgent: UA.androidChrome, webkitGetUserMedia };
    assert.equal(detectMediaSupport(nav, true).camera, true);
    assert.equal(await getUserMediaCompat(nav, { audio: true }), stream);
  });

  test("a camera that rejects the preferred resolution is retried once with video: true", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("over"), { name: "OverconstrainedError" }))
      .mockResolvedValueOnce(stream);
    const result = await getUserMediaCompat({ mediaDevices: { getUserMedia } }, { video: { width: { ideal: 1920 } }, audio: false });
    assert.equal(result, stream);
    assert.deepEqual(getUserMedia.mock.calls[1][0], { video: true, audio: false });
  });

  test("a denied permission is not retried and surfaces as-is", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    await assert.rejects(getUserMediaCompat({ mediaDevices: { getUserMedia } }, { video: { width: { ideal: 1280 } } }), denied);
    assert.equal(getUserMedia.mock.calls.length, 1);
  });

  test("screen capture retries without hints Safari rejects", async () => {
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new TypeError("bad constraint"), { name: "TypeError" }))
      .mockResolvedValueOnce(stream);
    const result = await getDisplayMediaCompat({ mediaDevices: { getDisplayMedia } }, { video: { frameRate: { ideal: 60 } }, audio: false });
    assert.equal(result, stream);
    assert.deepEqual(getDisplayMedia.mock.calls[1][0], { video: true, audio: false });
  });

  test("no capture API at all rejects with NotSupportedError", async () => {
    await assert.rejects(getUserMediaCompat({}, { audio: true }), (error: { name?: string }) => error.name === "NotSupportedError");
    await assert.rejects(getDisplayMediaCompat({}, { video: true }), (error: { name?: string }) => error.name === "NotSupportedError");
  });
});
