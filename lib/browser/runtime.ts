import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createBrowserbaseSession,
  staticRemoteEndpoint,
} from "@/lib/browser/remote";
import { assessUrl } from "@/lib/browser/url-policy";
import { chromium as playwrightChromium } from "playwright-core";

/**
 * The real browser.
 *
 * One Chromium process per server process, and one isolated browser context per session. Context is
 * the isolation boundary Playwright gives us: separate cookie jar, separate local storage, separate
 * cache, separate download directory. Two tenants sharing a browser process therefore share nothing
 * they can observe, and closing a session closes everything it accumulated.
 *
 * Everything here returns a result instead of throwing: a browser that fails is a normal outcome the
 * worker has to record, not an exception that loses the evidence.
 */

export type BrowserFailure = { ok: false; code: string; message: string };

export type RuntimeConfig = {
  headless: boolean;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  maxSteps: number;
  evidenceDir: string;
};

const DEFAULT_CONFIG: RuntimeConfig = {
  headless: process.env.BROWSER_HEADLESS !== "0",
  navigationTimeoutMs: Number(process.env.BROWSER_NAV_TIMEOUT_MS ?? 20_000),
  actionTimeoutMs: Number(process.env.BROWSER_ACTION_TIMEOUT_MS ?? 10_000),
  maxSteps: Number(process.env.BROWSER_MAX_STEPS ?? 40),
  evidenceDir:
    process.env.BROWSER_EVIDENCE_DIR ?? "/tmp/zooka-browser-evidence",
};

type AnyPage = {
  goto(url: string, options?: unknown): Promise<unknown>;
  click(selector: string, options?: unknown): Promise<void>;
  fill(selector: string, value: string, options?: unknown): Promise<void>;
  selectOption(selector: string, value: string): Promise<unknown>;
  evaluate<T>(fn: unknown, arg?: unknown): Promise<T>;
  screenshot(options?: unknown): Promise<Buffer>;
  url(): string;
  title(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  innerText(selector: string): Promise<string>;
  isClosed(): boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
  mouse: { click(x: number, y: number, options?: unknown): Promise<void> };
  keyboard: {
    type(text: string, options?: unknown): Promise<void>;
    press(key: string): Promise<void>;
  };
  textContent(selector: string): Promise<string | null>;
  close(): Promise<void>;
};

type AnyContext = {
  newPage(): Promise<AnyPage>;
  close(): Promise<void>;
  cookies(): Promise<unknown[]>;
};

type AnyBrowser = {
  newContext(options?: unknown): Promise<AnyContext>;
  close(): Promise<void>;
  version(): string;
  isConnected(): boolean;
};

type SessionHandle = {
  organizationId: string;
  context: AnyContext;
  page: AnyPage;
  steps: number;
  /** Set when Chromium reports a crash or the connection drops. Never cleared by guessing. */
  crashed: string | null;
};

/**
 * The Chromium driver.
 *
 * This is a static import on purpose. The previous version resolved the module by name at request
 * time, which cannot be traced by the bundler and fails inside a deployed function with
 * browser_runtime_unavailable no matter what is configured - a failure that looks exactly like a
 * missing token. playwright-core is a declared runtime dependency, so importing it directly is both
 * simpler and honest: if it is missing, the build says so.
 */
async function loadChromium() {
  return playwrightChromium;
}

class BrowserRuntime {
  private browser: AnyBrowser | null = null;
  /** Which engine is serving: a local Chromium or a configured remote one. */
  private engineName: string | null = null;
  private readonly sessions = new Map<string, SessionHandle>();
  private readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  version(): string | null {
    return this.browser?.isConnected() ? this.browser.version() : null;
  }

  engine(): string | null {
    return this.engineName;
  }

  activeSessions(): number {
    return this.sessions.size;
  }

  private async ensureBrowser(): Promise<AnyBrowser> {
    if (this.browser && this.browser.isConnected()) return this.browser;
    const chromium = await loadChromium();

    // A deployed serverless function cannot launch Chromium, so a configured remote DevTools
    // endpoint is the real browser. It is tried first, and its failures are reported as they are
    // rather than silently falling back to a launch that cannot work in that environment.
    const remote = staticRemoteEndpoint();
    if (remote) {
      const endpoint =
        remote.engine === "browserbase"
          ? ((await createBrowserbaseSession()) ?? "")
          : remote.url;
      if (!endpoint) throw new Error("browser_runtime_unavailable");
      this.browser = await chromium.connectOverCDP(endpoint);
      this.engineName = remote.engine;
      return this.browser;
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--disable-background-networking",
      ],
    });
    this.engineName = "local_chromium";
    return this.browser;
  }

  async open(
    sessionId: string,
    organizationId: string,
  ): Promise<{ ok: true } | BrowserFailure> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      // A session id belongs to one workspace. Re-opening it from another is refused here as well as
      // in the database, so neither layer is the only guard.
      if (existing.organizationId !== organizationId) {
        return {
          ok: false,
          code: "session_owned_by_another_workspace",
          message: "refused",
        };
      }
      return { ok: true };
    }
    try {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        acceptDownloads: true,
        locale: "ar-AE",
        timezoneId: "Asia/Dubai",
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const handle: SessionHandle = {
        organizationId,
        context,
        page,
        steps: 0,
        crashed: null,
      };
      // A crashed tab and a dropped browser are both real states the customer must be told about,
      // so they are recorded when Chromium reports them rather than inferred from a failed request.
      page.on("crash", () => {
        handle.crashed = "page_crashed";
      });
      page.on("close", () => {
        if (handle.crashed === null) handle.crashed = "page_closed";
      });
      this.sessions.set(sessionId, handle);
      return { ok: true };
    } catch (error) {
      // The reason matters to whoever has to fix the engine: a refused token and a refused
      // connection look identical if only the code survives.
      const message = describe(error);
      console.error("[browser] open failed:", message);
      return { ok: false, code: "launch_failed", message };
    }
  }

  async close(sessionId: string): Promise<void> {
    const handle = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (handle) await handle.context.close().catch(() => {});
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.close(id);
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  has(sessionId: string, organizationId: string): boolean {
    const handle = this.sessions.get(sessionId);
    return Boolean(handle && handle.organizationId === organizationId);
  }

  /**
   * Bind an already-running browser back to a session.
   *
   * A serverless function keeps its memory for one request only, so the live tab created by
   * "start" does not exist in the process that serves the next frame. Instead of pretending the
   * session ended, the runtime reconnects to the same DevTools endpoint and adopts the tab that is
   * already there. This only makes sense for an endpoint that outlives a connection (a persistent
   * Chromium), which is exactly why it is opt-in through BROWSER_CDP_URL.
   */
  async reattach(
    sessionId: string,
    organizationId: string,
    endpoint: string,
    preferredUrl?: string,
  ): Promise<{ ok: true; adopted: "existing_tab" | "new_tab" } | BrowserFailure> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing.organizationId === organizationId
        ? { ok: true, adopted: "existing_tab" }
        : { ok: false, code: "session_owned_by_another_workspace", message: "refused" };
    }
    try {
      const chromium = await loadChromium();
      const browser = await chromium.connectOverCDP(endpoint);
      this.browser = browser;
      this.engineName = "remote_cdp";
      const openedContexts = browser.contexts();
      const createdContext = openedContexts[0] ?? null;
      const baseContext = createdContext ?? (await browser.newContext({
        viewport: { width: 1366, height: 900 },
        acceptDownloads: true,
        locale: "ar-AE",
        timezoneId: "Asia/Dubai",
        serviceWorkers: "block",
      }));
      // A remote engine may keep the live tab in any context it opened for this session, so look
      // across all of them: matching the session's own pages beats the blank tab that a fresh
      // connection always exposes first.
      const pages = openedContexts.flatMap((candidate) => candidate.pages());
      const tuned = preferredUrl
        ? pages.find((candidate) => candidate.url().startsWith(preferredUrl))
        : undefined;
      const page = tuned ?? pages.find((candidate) => candidate.url() !== "about:blank") ?? pages[0];
      const adopted = page ? "existing_tab" : "new_tab";
      const livePage = page ?? (await baseContext.newPage());
      const context = page ? page.context() : baseContext;
      const handle: SessionHandle = {
        organizationId,
        context,
        page: livePage,
        steps: 0,
        crashed: null,
      };
      livePage.on("crash", () => {
        handle.crashed = "page_crashed";
      });
      livePage.on("close", () => {
        if (handle.crashed === null) handle.crashed = "page_closed";
      });
      this.sessions.set(sessionId, handle);
      return { ok: true, adopted };
    } catch (error) {
      const message = describe(error);
      console.error("[browser] reattach failed:", message);
      return { ok: false, code: "reattach_failed", message };
    }
  }

  private handle(
    sessionId: string,
    organizationId: string,
  ): SessionHandle | BrowserFailure {
    const handle = this.sessions.get(sessionId);
    if (!handle)
      return {
        ok: false,
        code: "session_not_running",
        message: "no live browser for this session",
      };
    if (handle.organizationId !== organizationId) {
      return {
        ok: false,
        code: "session_owned_by_another_workspace",
        message: "refused",
      };
    }
    return handle;
  }

  private budget(handle: SessionHandle): BrowserFailure | null {
    if (handle.steps >= this.config.maxSteps) {
      return {
        ok: false,
        code: "step_budget_exhausted",
        message: `limit ${this.config.maxSteps}`,
      };
    }
    handle.steps += 1;
    return null;
  }

  async navigate(
    sessionId: string,
    organizationId: string,
    url: string,
  ): Promise<
    | { ok: true; url: string; title: string; status: number | null }
    | BrowserFailure
  > {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;

    const assessment = await assessUrl(url);
    if (!assessment.ok) {
      return {
        ok: false,
        code: `url_refused:${assessment.reason}`,
        message: assessment.detail ?? assessment.reason,
      };
    }
    try {
      const response = (await handle.page.goto(assessment.url, {
        timeout: this.config.navigationTimeoutMs,
        waitUntil: "domcontentloaded",
      })) as { status?: () => number } | null;
      return {
        ok: true,
        url: handle.page.url(),
        title: await handle.page.title(),
        status:
          typeof response?.status === "function" ? response.status() : null,
      };
    } catch (error) {
      return { ok: false, code: "navigation_failed", message: describe(error) };
    }
  }

  async click(
    sessionId: string,
    organizationId: string,
    selector: string,
  ): Promise<{ ok: true; url: string } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    try {
      await handle.page.click(selector, {
        timeout: this.config.actionTimeoutMs,
      });
      await handle.page.waitForTimeout(250);
      return { ok: true, url: handle.page.url() };
    } catch (error) {
      return { ok: false, code: "click_failed", message: describe(error) };
    }
  }

  async type(
    sessionId: string,
    organizationId: string,
    selector: string,
    text: string,
  ): Promise<{ ok: true } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    if (text.length > 2000)
      return {
        ok: false,
        code: "text_too_long",
        message: `${text.length} characters`,
      };
    try {
      await handle.page.fill(selector, text, {
        timeout: this.config.actionTimeoutMs,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: "type_failed", message: describe(error) };
    }
  }

  async select(
    sessionId: string,
    organizationId: string,
    selector: string,
    value: string,
  ): Promise<{ ok: true } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    try {
      await handle.page.selectOption(selector, value);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: "select_failed", message: describe(error) };
    }
  }

  async scroll(
    sessionId: string,
    organizationId: string,
    deltaY: number,
  ): Promise<{ ok: true; scrollY: number } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    try {
      const scrollY = await handle.page.evaluate<number>((by: number) => {
        window.scrollBy(0, by);
        return window.scrollY;
      }, deltaY);
      return { ok: true, scrollY };
    } catch (error) {
      return { ok: false, code: "scroll_failed", message: describe(error) };
    }
  }

  async read(
    sessionId: string,
    organizationId: string,
    options: { selector?: string; maxChars?: number } = {},
  ): Promise<
    { ok: true; url: string; title: string; text: string } | BrowserFailure
  > {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    const limit = Math.min(options.maxChars ?? 4000, 20_000);
    try {
      const text = options.selector
        ? await handle.page.innerText(options.selector)
        : await handle.page.evaluate<string>(
            "document.body ? document.body.innerText : ''",
          );
      return {
        ok: true,
        url: handle.page.url(),
        title: await handle.page.title(),
        text: text.slice(0, limit),
      };
    } catch (error) {
      return { ok: false, code: "read_failed", message: describe(error) };
    }
  }

  /** Whether a live browser is attached, and whether it has died since it was opened. */
  health(
    sessionId: string,
    organizationId: string,
  ): { live: boolean; crashed: string | null } {
    const handle = this.sessions.get(sessionId);
    if (!handle || handle.organizationId !== organizationId)
      return { live: false, crashed: null };
    if (handle.crashed) return { live: false, crashed: handle.crashed };
    if (handle.page.isClosed()) return { live: false, crashed: "page_closed" };
    if (!this.browser?.isConnected())
      return { live: false, crashed: "browser_disconnected" };
    return { live: true, crashed: null };
  }

  /**
   * A real click at a point a person chose in a frame.
   *
   * This is what makes take-over more than a label: the coordinates come from the panel, the click is
   * dispatched to the live page, and the resulting URL is read back. It is a real mouse event, not a
   * suggestion to the agent.
   */
  async clickPoint(
    sessionId: string,
    organizationId: string,
    point: { x: number; y: number },
  ): Promise<{ ok: true; url: string } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > 4000 ||
      point.y > 4000
    ) {
      return {
        ok: false,
        code: "invalid_point",
        message: "coordinates out of range",
      };
    }
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    try {
      await handle.page.mouse.click(Math.round(point.x), Math.round(point.y));
      await handle.page.waitForTimeout(250);
      return { ok: true, url: handle.page.url() };
    } catch (error) {
      return { ok: false, code: "click_failed", message: describe(error) };
    }
  }

  /** Real keystrokes into whatever the person has focused. */
  async typeKeys(
    sessionId: string,
    organizationId: string,
    text: string,
    options: { submit?: boolean } = {},
  ): Promise<{ ok: true; url: string } | BrowserFailure> {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    if (text.length > 500)
      return {
        ok: false,
        code: "text_too_long",
        message: `${text.length} characters`,
      };
    const exhausted = this.budget(handle);
    if (exhausted) return exhausted;
    try {
      if (text.length > 0) await handle.page.keyboard.type(text);
      if (options.submit) {
        await handle.page.keyboard.press("Enter");
        await handle.page.waitForTimeout(300);
      }
      return { ok: true, url: handle.page.url() };
    } catch (error) {
      return { ok: false, code: "typing_failed", message: describe(error) };
    }
  }

  async screenshot(
    sessionId: string,
    organizationId: string,
    label: string,
  ): Promise<
    | { ok: true; path: string; bytes: number; url: string; title: string }
    | BrowserFailure
  > {
    const handle = this.handle(sessionId, organizationId);
    if ("ok" in handle) return handle;
    try {
      const safeLabel =
        label.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "frame";
      const directory = join(
        this.config.evidenceDir,
        organizationId.replace(/[^a-zA-Z0-9_-]/g, "-"),
      );
      await mkdir(directory, { recursive: true });
      const path = join(
        directory,
        `${sessionId}-${Date.now()}-${safeLabel}.png`,
      );
      const buffer = await handle.page.screenshot({ fullPage: false });
      await writeFile(path, buffer);
      return {
        ok: true,
        path,
        bytes: buffer.byteLength,
        url: handle.page.url(),
        title: await handle.page.title(),
      };
    } catch (error) {
      return { ok: false, code: "screenshot_failed", message: describe(error) };
    }
  }
}

/** Playwright messages carry selectors and URLs; strip anything shaped like a credential. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/[^\s]*?:[^\s]*?@/g, "https://[redacted]@")
    .replace(/(password|token|secret|api[_-]?key)=([^\s&]+)/gi, "$1=[redacted]")
    .slice(0, 400);
}

const globalForRuntime = globalThis as unknown as {
  __zookaBrowserRuntime?: BrowserRuntime;
};

export function browserRuntime(): BrowserRuntime {
  if (!globalForRuntime.__zookaBrowserRuntime) {
    globalForRuntime.__zookaBrowserRuntime = new BrowserRuntime();
  }
  return globalForRuntime.__zookaBrowserRuntime;
}

export type { BrowserRuntime };
