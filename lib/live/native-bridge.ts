/**
 * The bridge to the ZOOKA-AI Android app (mobile/android).
 *
 * Android browsers cannot capture the screen, so the app does it natively: the page mints a
 * single-room token with the member's own session and posts it to the app, which joins the same room
 * as a second participant and publishes only the screen. The app injects `window.ZookaNative` as a
 * WebMessageListener scoped by the WebView to https://zooka-ai.com, so the object only exists inside
 * the app, on this site.
 */

export const ANDROID_APP_URL =
  "https://github.com/ZOOKA-AI/chatbot/releases/download/android-latest/zooka-live.apk";

export type NativeMessage =
  | { type: "hello"; screen: boolean; version?: string }
  | { type: "screen"; state: "started" | "stopped" | "error"; reason?: string; message?: string };

type NativeEvent = { data: unknown };

export type NativePort = {
  postMessage(data: string): void;
  onmessage?: ((event: NativeEvent) => void) | null;
  addEventListener?: (type: "message", listener: (event: NativeEvent) => void) => void;
  removeEventListener?: (type: "message", listener: (event: NativeEvent) => void) => void;
};

export function getNativePort(win: { ZookaNative?: unknown } | undefined): NativePort | null {
  const candidate = win?.ZookaNative as Partial<NativePort> | undefined;
  return candidate && typeof candidate.postMessage === "function" ? (candidate as NativePort) : null;
}

export function parseNativeMessage(data: unknown): NativeMessage | null {
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type === "hello") {
    return {
      type: "hello",
      screen: message.screen === true,
      ...(typeof message.version === "string" ? { version: message.version } : {}),
    };
  }
  if (message.type === "screen" && (message.state === "started" || message.state === "stopped" || message.state === "error")) {
    return {
      type: "screen",
      state: message.state,
      ...(typeof message.reason === "string" ? { reason: message.reason } : {}),
      ...(typeof message.message === "string" ? { message: message.message } : {}),
    };
  }
  return null;
}

export type NativeScreenBridge = {
  hello(): void;
  start(url: string, token: string): void;
  stop(): void;
  dispose(): void;
};

export function createNativeScreenBridge(
  port: NativePort,
  onMessage: (message: NativeMessage) => void
): NativeScreenBridge {
  const listener = (event: NativeEvent) => {
    const message = parseNativeMessage(event.data);
    if (message) onMessage(message);
  };
  if (typeof port.addEventListener === "function") {
    port.addEventListener("message", listener);
  } else {
    port.onmessage = listener;
  }
  const post = (payload: Record<string, string>) => port.postMessage(JSON.stringify(payload));
  return {
    hello: () => post({ type: "hello" }),
    start: (url, token) => post({ type: "screen:start", url, token }),
    stop: () => post({ type: "screen:stop" }),
    dispose: () => {
      if (typeof port.removeEventListener === "function") {
        port.removeEventListener("message", listener);
      } else if (port.onmessage === listener) {
        port.onmessage = null;
      }
    },
  };
}
