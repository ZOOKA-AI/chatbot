import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

import { detectMediaSupport, supportNotice } from "@/lib/live/media-support";
import {
  ANDROID_APP_URL,
  createNativeScreenBridge,
  getNativePort,
  type NativePort,
  parseNativeMessage,
} from "@/lib/live/native-bridge";

/**
 * Android browsers cannot capture the screen; the ZOOKA-AI Android app can. The page and the app
 * talk through `window.ZookaNative`, which only exists inside the app on zooka-ai.com.
 */

const androidChrome =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

function fakePort() {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const port: NativePort & { emit(data: unknown): void; sent: string[] } = {
    sent: [],
    postMessage(data: string) {
      port.sent.push(data);
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    removeEventListener(_type, listener) {
      listeners.splice(listeners.indexOf(listener), 1);
    },
    emit(data: unknown) {
      for (const listener of [...listeners]) listener({ data });
    },
  };
  return port;
}

describe("detecting the app", () => {
  test("a normal browser has no bridge", () => {
    assert.equal(getNativePort({}), null);
    assert.equal(getNativePort(undefined), null);
    assert.equal(getNativePort({ ZookaNative: {} }), null);
  });

  test("the app's injected object is recognised", () => {
    const port = fakePort();
    assert.equal(getNativePort({ ZookaNative: port }), port);
  });
});

describe("messages from the app", () => {
  test("only known shapes are accepted, from strings or objects", () => {
    assert.deepEqual(parseNativeMessage('{"type":"hello","screen":true,"version":"1.0.3"}'), {
      type: "hello",
      screen: true,
      version: "1.0.3",
    });
    assert.deepEqual(parseNativeMessage({ type: "screen", state: "error", message: "x" }), {
      type: "screen",
      state: "error",
      message: "x",
    });
    assert.equal(parseNativeMessage("not json"), null);
    assert.equal(parseNativeMessage({ type: "screen", state: "hijack" }), null);
    assert.equal(parseNativeMessage({ type: "other" }), null);
  });
});

describe("driving the app's screen capture", () => {
  test("hello, start and stop post exactly the protocol the app reads", () => {
    const port = fakePort();
    const bridge = createNativeScreenBridge(port, () => undefined);
    bridge.hello();
    bridge.start("wss://example.livekit.cloud", "token-123");
    bridge.stop();
    assert.deepEqual(
      port.sent.map((raw) => JSON.parse(raw)),
      [
        { type: "hello" },
        { type: "screen:start", url: "wss://example.livekit.cloud", token: "token-123" },
        { type: "screen:stop" },
      ]
    );
  });

  test("replies reach the page until it disposes the bridge", () => {
    const port = fakePort();
    const onMessage = vi.fn();
    const bridge = createNativeScreenBridge(port, onMessage);
    port.emit('{"type":"screen","state":"started"}');
    port.emit("garbage");
    bridge.dispose();
    port.emit('{"type":"screen","state":"stopped"}');
    assert.deepEqual(onMessage.mock.calls, [[{ type: "screen", state: "started" }]]);
  });

  test("a port with only onmessage works too", () => {
    const sent: string[] = [];
    const port: NativePort = { postMessage: (data) => sent.push(data), onmessage: null };
    const onMessage = vi.fn();
    const bridge = createNativeScreenBridge(port, onMessage);
    port.onmessage?.({ data: { type: "hello", screen: true } });
    assert.equal(onMessage.mock.calls.length, 1);
    bridge.dispose();
    assert.equal(port.onmessage, null);
  });
});

describe("what the Android notice says", () => {
  const support = detectMediaSupport(
    { userAgent: androidChrome, mediaDevices: { getUserMedia: async () => ({}) as MediaStream } },
    true
  );

  test("in an Android browser it points to the app", () => {
    assert.match(supportNotice(support, "ar") ?? "", /تطبيق ZOOKA-AI لأندرويد/);
    assert.match(supportNotice(support, "en") ?? "", /Android app/);
    assert.match(ANDROID_APP_URL, /^https:\/\/github\.com\/ZOOKA-AI\/chatbot\/releases\/download\/android-latest\/zooka-live\.apk$/);
  });

  test("inside the app the screen works, so there is nothing to explain", () => {
    assert.equal(supportNotice(support, "ar", { nativeScreen: true }), null);
  });
});
