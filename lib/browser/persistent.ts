import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Browser-side session ownership.
 *
 * The problem this module solves, stated plainly: a browser context created through Playwright's
 * own API belongs to the Playwright connection. When the connection dies, Playwright disposes what
 * it created, and the customer's tab disappears with it. Measured, not assumed: after the worker
 * process was killed, the engine reported one target, about:blank.
 *
 * So this module never asks Playwright to own anything. It talks Chrome DevTools Protocol directly
 * over a WebSocket and creates the browser context at the browser level
 * (`Target.createBrowserContext`). Ownership then sits in Chromium, which stays alive, instead of in
 * a serverless function that does not. A later worker reconnects, lists targets, finds the same
 * context id and the same target id, and reads the live page: URL, cookies, local storage.
 *
 * Deliberately dependency-free (node 22+ global WebSocket, no `@/` imports) so the continuity gate
 * can run it as a plain script outside the Next.js build.
 */

export type PersistentHandle = {
  endpoint: string;
  browserContextId: string;
  targetId: string;
  /**
   * HMAC over this handle's ids and the workspace that owns it. A browser context id is a
   * capability: whoever holds it can read a customer's cookies. The signature means a caller cannot
   * borrow someone else's handle by asserting a different workspace, because the workspace it claims
   * is part of the signed message.
   */
  signature: string;
};

export type BrowserState = {
  url: string;
  title: string;
  cookies: { name: string; value: string; domain: string }[];
  localStorage: Record<string, string>;
};

export type PersistentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The key that binds a handle to its workspace. In production this must be a server secret
 * (BROWSER_HANDLE_KEY); the fallback is deliberately ugly-named so a missing secret is obvious in a
 * log rather than silently strong enough.
 */
function handleKey(): string {
  return process.env.BROWSER_HANDLE_KEY?.trim() || "dev-only-handle-key-not-for-production";
}

export function handleKeySource(): "env" | "dev_fallback" {
  return process.env.BROWSER_HANDLE_KEY?.trim() ? "env" : "dev_fallback";
}

/**
 * Rebuild a handle for a stored session. The database keeps the ids, never the signature: the
 * signature is recomputed from the server key so a key rotation invalidates old capabilities.
 */
export function mintHandle(input: {
  endpoint: string;
  browserContextId: string;
  targetId: string;
  organizationId: string;
}): PersistentHandle {
  return {
    endpoint: input.endpoint,
    browserContextId: input.browserContextId,
    targetId: input.targetId,
    signature: signHandle(input, input.organizationId),
  };
}

function signHandle(
  ids: { browserContextId: string; targetId: string },
  organizationId: string,
): string {
  return createHmac("sha256", handleKey())
    .update(`${ids.browserContextId}:${ids.targetId}:${organizationId}`)
    .digest("hex");
}

/** True only when the handle is intact and was minted for this workspace. */
export function verifyHandle(handle: PersistentHandle, organizationId: string): boolean {
  const expected = signHandle(handle, organizationId);
  const given = Buffer.from(handle.signature ?? "", "hex");
  const wanted = Buffer.from(expected, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** One short-lived CDP connection. Closed explicitly by the caller, never kept on a warm worker. */
class CdpConnection {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  private listeners = new Set<(message: CdpMessage) => void>();

  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event: MessageEvent) => {
      let parsed: CdpMessage;
      try {
        parsed = JSON.parse(String(event.data)) as CdpMessage;
      } catch {
        return;
      }
      if (typeof parsed.id === "number") {
        const waiter = this.pending.get(parsed.id);
        if (!waiter) return;
        this.pending.delete(parsed.id);
        if (parsed.error) {
          waiter.reject(new Error(`${parsed.error.code}: ${parsed.error.message}`));
        } else {
          waiter.resolve(parsed.result ?? {});
        }
        return;
      }
      for (const listener of this.listeners) listener(parsed);
    });
  }

  static async open(endpoint: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CdpConnection> {
    const socket = new (await webSocketImplementation())(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cdp_connect_timeout")), timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("cdp_connect_failed"));
      });
    });
    return new CdpConnection(socket);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const payload: CdpMessage = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cdp_timeout:${method}`));
      }, DEFAULT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  onMessage(listener: (message: CdpMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      /* already closed */
    }
    for (const waiter of this.pending.values()) waiter.reject(new Error("cdp_closed"));
    this.pending.clear();
    this.listeners.clear();
  }
}


/**
 * Node 22+ exposes WebSocket globally; Node 20 does not, and Vercel builds and CI both still run 20.
 * Depending on the global alone meant this module worked on the development machine and threw a
 * ReferenceError inside a function, which the caller could only report as `runtime_unavailable`.
 * `ws` is a declared dependency, so a Node without the global gets the same object instead of a crash.
 */
async function webSocketImplementation(): Promise<typeof WebSocket> {
  const existing = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (existing) return existing;
  const imported = (await import("ws")) as unknown as { WebSocket?: typeof WebSocket; default?: typeof WebSocket };
  const Fallback = imported.WebSocket ?? imported.default;
  if (!Fallback) throw new Error("no_websocket_implementation");
  return Fallback;
}

/** The http endpoint that can mint a fresh DevTools WebSocket, derived from a websocket URL. */
function httpBase(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    const scheme = url.protocol === "wss:" ? "https:" : "http:";
    const path = url.pathname.includes("/devtools/") ? "" : url.pathname.replace(/\/$/, "");
    return `${scheme}//${url.host}${path}`;
  } catch {
    return null;
  }
}

/** Chrome's browser-level WebSocket, which survives for as long as the engine process does. */
export async function browserWebSocketUrl(endpoint: string): Promise<string> {
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
    // Two shapes are already a browser socket: the engine's own /devtools/browser/ URL, and the
    // authenticated gateway (wss://gateway/cdp), which relays to that same socket. A tab-scoped
    // /devtools/page/ URL can do neither, so it falls through and is rejected by the HTTP probe.
    if (endpoint.includes("/devtools/browser/") || !endpoint.includes("/devtools/")) return endpoint;
  }
  const base = httpBase(endpoint);
  if (!base) throw new Error("invalid_endpoint");
  const response = await fetch(`${base}/json/version`);
  if (!response.ok) throw new Error(`engine_http_${response.status}`);
  const body = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!body.webSocketDebuggerUrl) throw new Error("engine_no_websocket");
  return body.webSocketDebuggerUrl;
}

/**
 * Authorize a handle against who is asking. The manager is not the only gate (the database row is),
 * but a browser context id is a capability, so a manager call with the wrong workspace never
 * proceeds even if an id leaked.
 */
export function authorizesHandle(
  handle: PersistentHandle,
  owner: { organizationId: string },
  asker: { organizationId: string },
): boolean {
  if (!handle.browserContextId || !owner.organizationId) return false;
  if (owner.organizationId !== asker.organizationId) return false;
  return verifyHandle(handle, owner.organizationId);
}

/** Create a browser context owned by Chromium, with one tab inside it. */
export async function createPersistentSession(input: {
  endpoint: string;
  url: string;
  /** Recorded so a later authorize() call compares the same workspace, not a caller-supplied one. */
  organizationId: string;
}): Promise<PersistentResult<PersistentHandle>> {
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.endpoint));
    const created = await connection.send("Target.createBrowserContext", {
      disposeOnDetach: false,
      proxyServer: "",
    });
    const browserContextId = String(created.browserContextId ?? "");
    if (!browserContextId) return { ok: false, code: "no_browser_context", message: "no id" };

    const target = await connection.send("Target.createTarget", {
      url: input.url,
      browserContextId,
    });
    const targetId = String(target.targetId ?? "");
    if (!targetId) return { ok: false, code: "no_target", message: "no target id" };

    return {
      ok: true,
      value: mintHandle({
        endpoint: input.endpoint,
        browserContextId,
        targetId,
        organizationId: input.organizationId,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      code: "create_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/** Every target the engine holds right now, with the context each one belongs to. */
export async function listTargets(endpoint: string): Promise<
  PersistentResult<{ targetId: string; browserContextId: string; url: string }[]>
> {
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(endpoint));
    const result = await connection.send("Target.getTargets");
    const infos = (result.targetInfos ?? []) as Record<string, unknown>[];
    return {
      ok: true,
      value: infos
        .filter((info) => info.type === "page")
        .map((info) => ({
          targetId: String(info.targetId ?? ""),
          browserContextId: String(info.browserContextId ?? ""),
          url: String(info.url ?? ""),
        })),
    };
  } catch (error) {
    return {
      ok: false,
      code: "list_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

async function attach(connection: CdpConnection, targetId: string): Promise<string> {
  const attached = await connection.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const sessionId = String(attached.sessionId ?? "");
  if (!sessionId) throw new Error("attach_failed");
  return sessionId;
}

async function evaluate(
  connection: CdpConnection,
  sessionId: string,
  expression: string,
): Promise<unknown> {
  const result = await connection.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  const exception = result.exceptionDetails as { text?: string } | undefined;
  if (exception) throw new Error(`evaluate_failed:${exception.text ?? "unknown"}`);
  return (result.result as { value?: unknown } | undefined)?.value;
}

/**
 * Read the live state of a tab that this process did not create.
 *
 * This is the whole point: nothing here depends on the worker that opened the tab still existing.
 */
export async function readBrowserState(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
}): Promise<PersistentResult<BrowserState>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const targets = await connection.send("Target.getTargets");
    const infos = (targets.targetInfos ?? []) as Record<string, unknown>[];
    const match = infos.find((info) => String(info.targetId ?? "") === input.handle.targetId);
    if (!match) return { ok: false, code: "target_gone", message: "tab no longer exists" };
    const contextMatches =
      String(match.browserContextId ?? "") === input.handle.browserContextId;
    if (!contextMatches) {
      return { ok: false, code: "context_mismatch", message: "tab moved to another context" };
    }

    const sessionId = await attach(connection, input.handle.targetId);
    const url = String(await evaluate(connection, sessionId, "location.href"));
    const title = String(await evaluate(connection, sessionId, "document.title"));
    const storage = (await evaluate(
      connection,
      sessionId,
      "Object.fromEntries(Object.entries(localStorage))",
    )) as Record<string, string> | null;

    const cookies = await connection.send(
      "Network.getCookies",
      { urls: [url] },
      sessionId,
    );
    const jar = (cookies.cookies ?? []) as Record<string, unknown>[];

    return {
      ok: true,
      value: {
        url,
        title,
        localStorage: storage ?? {},
        cookies: jar.map((cookie) => ({
          name: String(cookie.name ?? ""),
          value: String(cookie.value ?? ""),
          domain: String(cookie.domain ?? ""),
        })),
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: "read_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/** Write state into a tab, used to seed a session before the creating worker disappears. */
export async function seedBrowserState(input: {
  handle: PersistentHandle;
  cookie?: { name: string; value: string };
  storage?: Record<string, string>;
}): Promise<PersistentResult<{ url: string }>> {
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);

    // Wait for the document to exist before touching storage.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await evaluate(connection, sessionId, "document.readyState");
      if (ready === "complete" || ready === "interactive") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (input.cookie) {
      await evaluate(
        connection,
        sessionId,
        `document.cookie = ${JSON.stringify(
          `${input.cookie.name}=${input.cookie.value}; path=/`,
        )}; "ok"`,
      );
    }
    if (input.storage) {
      await evaluate(
        connection,
        sessionId,
        `for (const [k, v] of Object.entries(${JSON.stringify(
          input.storage,
        )})) localStorage.setItem(k, v); "ok"`,
      );
    }
    const url = String(await evaluate(connection, sessionId, "location.href"));
    return { ok: true, value: { url } };
  } catch (error) {
    return {
      ok: false,
      code: "seed_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/** Close a whole session: the context and every tab in it. */
export async function disposePersistentSession(
  handle: PersistentHandle,
): Promise<PersistentResult<{ disposed: true }>> {
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(handle.endpoint));
    await connection.send("Target.disposeBrowserContext", {
      browserContextId: handle.browserContextId,
    });
    return { ok: true, value: { disposed: true } };
  } catch (error) {
    return {
      ok: false,
      code: "dispose_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/**
 * Close contexts that nobody came back for.
 *
 * A persistent engine is a shared resource, so an abandoned context is a leak that grows: a crashed
 * worker leaves a tab holding a customer's cookies forever. Records older than the limit are closed.
 */
export async function expireIdleSessions(input: {
  endpoint: string;
  records: { handle: PersistentHandle; lastSeenAt: number }[];
  maxIdleMs: number;
  now?: number;
}): Promise<PersistentResult<{ expired: string[]; kept: string[] }>> {
  const now = input.now ?? Date.now();
  const expired: string[] = [];
  const kept: string[] = [];
  for (const record of input.records) {
    if (now - record.lastSeenAt <= input.maxIdleMs) {
      kept.push(record.handle.targetId);
      continue;
    }
    const result = await disposePersistentSession(record.handle);
    if (result.ok) expired.push(record.handle.targetId);
    else kept.push(record.handle.targetId);
  }
  return { ok: true, value: { expired, kept } };
}

/** Evaluate an expression inside an adopted tab and return the value. */
export async function evaluateInSession(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
  expression: string;
}): Promise<PersistentResult<unknown>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    return { ok: true, value: await evaluate(connection, sessionId, input.expression) };
  } catch (error) {
    return {
      ok: false,
      code: "evaluate_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/** A viewport image of an adopted tab, through the page's own CDP session. */
export async function captureSessionScreenshot(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
}): Promise<PersistentResult<{ bytes: number; format: string }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    const shot = await connection.send("Page.captureScreenshot", { format: "png" }, sessionId);
    const data = String(shot.data ?? "");
    return { ok: true, value: { bytes: Buffer.from(data, "base64").byteLength, format: "png" } };
  } catch (error) {
    return {
      ok: false,
      code: "screenshot_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/**
 * A real mouse click on an adopted tab.
 *
 * Dispatched as trusted browser input (`Input.dispatchMouseEvent`), not as a JS `.click()`, so the
 * page behaves exactly as it would for a person.
 */
export async function clickInSession(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
  x: number;
  y: number;
}): Promise<PersistentResult<{ clicked: true }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    await connection.send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: input.x, y: input.y, button: "left", clickCount: 1 },
      sessionId,
    );
    await connection.send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", x: input.x, y: input.y, button: "left", clickCount: 1 },
      sessionId,
    );
    return { ok: true, value: { clicked: true } };
  } catch (error) {
    return {
      ok: false,
      code: "click_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    connection?.close();
  }
}

/** A PNG of the adopted tab, as base64, for a caller that must hand the pixels to a <img>. */
export async function sessionScreenshotPng(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
}): Promise<PersistentResult<{ base64: string }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    // A page in a background tab may never have been painted; asking for one frame first makes the
    // screenshot deterministic instead of returning an empty white image.
    await connection.send("Page.bringToFront", {}, sessionId).catch(() => undefined);
    const shot = await connection.send("Page.captureScreenshot", { format: "png" }, sessionId);
    const base64 = String(shot.data ?? "");
    if (!base64) return { ok: false, code: "screenshot_empty", message: "no data" };
    return { ok: true, value: { base64 } };
  } catch (error) {
    return { ok: false, code: "screenshot_failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    connection?.close();
  }
}

/** Navigate the adopted tab and report where it actually landed. */
export async function navigateInSession(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
  url: string;
}): Promise<PersistentResult<{ url: string; title: string }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    await connection.send("Page.enable", {}, sessionId);
    const navigation = await connection.send("Page.navigate", { url: input.url }, sessionId);
    if (navigation.errorText) {
      return { ok: false, code: "navigation_failed", message: String(navigation.errorText) };
    }
    // Navigation is asynchronous: wait for the page's own readiness rather than sleeping a guess.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = await connection.send(
        "Runtime.evaluate",
        { expression: "document.readyState", returnByValue: true },
        sessionId,
      );
      const ready = String((state.result as { value?: unknown } | undefined)?.value ?? "");
      if (ready === "complete" || ready === "interactive") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const state = await readBrowserState({
      handle: input.handle,
      owner: input.owner,
      asker: input.asker,
    });
    if (state.ok === false) return { ok: false, code: state.code, message: state.message };
    return { ok: true, value: { url: state.value.url, title: state.value.title } };
  } catch (error) {
    return { ok: false, code: "navigation_failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    connection?.close();
  }
}

/** Insert text as trusted input, optionally pressing Enter. */
export async function typeInSession(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
  text: string;
  submit?: boolean;
}): Promise<PersistentResult<{ typed: true }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    await connection.send("Input.insertText", { text: input.text }, sessionId);
    if (input.submit) {
      for (const type of ["keyDown", "keyUp"]) {
        await connection.send(
          "Input.dispatchKeyEvent",
          { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
          sessionId,
        );
      }
    }
    return { ok: true, value: { typed: true } };
  } catch (error) {
    return { ok: false, code: "type_failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    connection?.close();
  }
}

/** Scroll the adopted tab with a real wheel event. */
export async function scrollInSession(input: {
  handle: PersistentHandle;
  owner: { organizationId: string };
  asker: { organizationId: string };
  deltaY: number;
}): Promise<PersistentResult<{ scrolledY: number }>> {
  if (!authorizesHandle(input.handle, input.owner, input.asker)) {
    return { ok: false, code: "forbidden_workspace", message: "handle belongs to another workspace" };
  }
  let connection: CdpConnection | null = null;
  try {
    connection = await CdpConnection.open(await browserWebSocketUrl(input.handle.endpoint));
    const sessionId = await attach(connection, input.handle.targetId);
    await connection.send(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", x: 10, y: 10, deltaX: 0, deltaY: input.deltaY },
      sessionId,
    );
    const position = await connection.send(
      "Runtime.evaluate",
      { expression: "window.scrollY", returnByValue: true },
      sessionId,
    );
    const scrolledY = Number((position.result as { value?: unknown } | undefined)?.value ?? 0);
    return { ok: true, value: { scrolledY } };
  } catch (error) {
    return { ok: false, code: "scroll_failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    connection?.close();
  }
}
