import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { accessSync } from "node:fs";

import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The application's own browser code, end to end, against a real Chromium and a real database.
 *
 * This file uses the routes' building blocks exactly as the app does — `createSession`,
 * `controlSession({action:"start"})`, `applyInput`, `expireSession` and the frame adapter — rather than
 * talking to Chromium directly. If any of that wiring is wrong, this test fails; a passing CDP harness
 * alone would not prove the application was connected.
 *
 * It runs only where a persistent engine and a disposable database are configured, because it writes
 * real rows. In CI (no engine, no database) it skips instead of failing, and it says so.
 */

const ENGINE_PORT = 19331;
const GATEWAY_PORT = 19791;
const PAGE_PORT = 18083;

/**
 * Which Chromium to drive.
 *
 * This used to be a hardcoded build path (`/root/.cache/ms-playwright/chromium-1161/...`). On the
 * CI runner that path is inside root's home, which is mode 0700 and owned by root, so spawning it
 * returned EACCES even though `playwright install chromium` had succeeded: the browser was installed
 * under /home/runner/.cache with a different build number. Asserting a path is not asserting a
 * browser.
 *
 * Playwright already knows which binary it installed, so ask it. If the answer is not executable,
 * the suite skips and says why instead of pretending to test the engine.
 */
const chromCandidate = (() => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    return chromium.executablePath();
  } catch {
    return null;
  }
})();
const chromUsable = (() => {
  if (!chromCandidate) return false;
  try {
    accessSync(chromCandidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
})();
// Runs wherever a real browser and a real database exist, which is the point: a browser test that
// only runs when someone remembers an environment variable is not a gate. ZOOKA_CDP_ENGINE=0 opts out.
const runnable =
  process.env.ZOOKA_CDP_ENGINE !== "0" && Boolean(process.env.DATABASE_URL?.trim()) && chromUsable;
const describeIf = runnable ? describe : describe.skip;

type Row = {
  id: string;
  organizationId: string;
  browserContextId: string | null;
  targetId: string | null;
  status: string;
  currentUrl: string | null;
};

describeIf("browser sessions on a persistent engine", () => {
  let workDir = "";
  let engine: ReturnType<typeof spawn> | null = null;
  let gateway: ReturnType<typeof spawn> | null = null;
  let pageServer: ReturnType<typeof createServer> | null = null;
  const created: string[] = [];
  const orgA = `test-org-a-${randomBytes(4).toString("hex")}`;
  const orgB = `test-org-b-${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    const token = randomBytes(24).toString("hex");
    workDir = await mkdtemp(join(tmpdir(), "zooka-app-cdp-"));
    pageServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        "<!doctype html><html><head><title>App Integration</title></head><body><h1 id=here>live</h1><button id=b onclick=\"document.getElementById('here').textContent='clicked'\">go</button></body></html>",
      );
    });
    await new Promise<void>((resolve) => pageServer!.listen(PAGE_PORT, "127.0.0.1", () => resolve()));

    engine = spawn(
      chromCandidate as string,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        `--remote-debugging-port=${ENGINE_PORT}`,
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${join(workDir, "profile")}`,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );

    gateway = spawn(process.execPath, ["./gateway/cdp-gateway.mjs"], {
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        GATEWAY_PORT: String(GATEWAY_PORT),
        GATEWAY_BIND: "127.0.0.1",
        UPSTREAM_CDP: `http://127.0.0.1:${ENGINE_PORT}`,
        GATEWAY_TENANTS: JSON.stringify({ [orgA]: token }),
        // No WS_MODULE_PATH: the gateway resolves "ws" as its own declared dependency. Pinning a
        // pnpm store path here is how the gateway failed to load on CI, where the layout differs.
      },
    });

    // The application reads the engine endpoint from the environment and nothing else, so this is the
    // only place the test differs from production.
    process.env.BROWSER_CDP_URL = `ws://127.0.0.1:${GATEWAY_PORT}/cdp?tenant=${orgA}&token=${token}`;
    process.env.BROWSER_HANDLE_KEY = randomBytes(32).toString("hex");

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const gatewayUp = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/healthz`).then((r) => r.ok).catch(() => false);
      const engineUp = await fetch(`http://127.0.0.1:${ENGINE_PORT}/json/version`).then((r) => r.ok).catch(() => false);
      if (gatewayUp && engineUp) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("engine or gateway never became ready");
  }, 120_000);

  afterAll(async () => {
    const { expireSession } = await import("@/lib/browser/sessions");
    for (const id of created) {
      await expireSession(orgA, id).catch(() => undefined);
      await expireSession(orgB, id).catch(() => undefined);
    }
    engine?.kill("SIGKILL");
    gateway?.kill("SIGKILL");
    pageServer?.close();
    await rm(workDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }, 60_000);

  it("starts a session, persists the context ids, and serves a frame of the live tab", async () => {
    const { createSession, controlSession, getSession } = await import("@/lib/browser/sessions");
    const { persistentFrame } = await import("@/lib/browser/cdp-adapter");

    const session = (await createSession({
      organizationId: orgA,
      ownerId: "test-user-a",
      projectId: null,
      startUrl: `http://127.0.0.1:${PAGE_PORT}/`,
      ttlMinutes: 10,
    })) as unknown as Row;
    created.push(session.id);

    const started = await controlSession({
      caller: { userId: "test-user-a", organizationId: orgA, role: "owner" } as never,
      sessionId: session.id,
      action: "start",
    });
    const startedRow = started.session as unknown as Row;

    // TEST A/B: a real context was created in Chromium and its ids were stored on the row.
    expect(startedRow.status).toBe("ready");
    expect(startedRow.browserContextId).toBeTruthy();
    expect(startedRow.targetId).toBeTruthy();
    expect(startedRow.currentUrl).toContain(`127.0.0.1:${PAGE_PORT}`);

    const stored = (await getSession(orgA, session.id)) as unknown as Row;
    expect(stored.browserContextId).toBe(startedRow.browserContextId);

    // TEST F/I: the frame route's code path returns real PNG bytes from that tab.
    const frame = await persistentFrame(stored);
    expect(frame.ok).toBe(true);
    if (frame.ok) {
      const bytes = Buffer.from(frame.value.base64, "base64");
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
  }, 120_000);

  it("drives the adopted tab through applyInput: navigate, scroll, click", async () => {
    const { getSession, applyInput, controlSession } = await import("@/lib/browser/sessions");
    const id = created[0];
    const row = (await getSession(orgA, id)) as unknown as Row;
    const caller = { userId: "test-user-a", organizationId: orgA, role: "owner" } as never;

    // A person must hold control before input is accepted; that is the app's own rule.
    await controlSession({ caller, sessionId: id, action: "take_over" });

    const navigated = await applyInput({ caller, sessionId: id, command: { kind: "navigate", url: `http://127.0.0.1:${PAGE_PORT}/?second=1` } });
    expect(navigated.executed).toBe("navigate");
    expect((navigated.session as unknown as Row).currentUrl).toContain("second=1");

    const scrolled = await applyInput({ caller, sessionId: id, command: { kind: "scroll", deltaY: 200 } });
    expect(scrolled.executed).toBe("scroll");

    const clicked = await applyInput({ caller, sessionId: id, command: { kind: "click", x: 30, y: 40 } });
    expect(clicked.executed).toBe("click");

    // The tab is still the same tab after all of that.
    const after = (await getSession(orgA, id)) as unknown as Row;
    expect(after.browserContextId).toBe(row.browserContextId);
    expect(after.targetId).toBe(row.targetId);
  }, 120_000);

  it("refuses another workspace, and refuses an unsupported command", async () => {
    const { applyInput } = await import("@/lib/browser/sessions");
    const id = created[0];

    await expect(
      applyInput({
        caller: { userId: "test-user-b", organizationId: orgB, role: "owner" } as never,
        sessionId: id,
        command: { kind: "navigate", url: `http://127.0.0.1:${PAGE_PORT}/` },
      }),
    ).rejects.toThrow(/session_not_found|not_session_owner/);

    await expect(
      applyInput({
        caller: { userId: "test-user-a", organizationId: orgA, role: "owner" } as never,
        sessionId: id,
        command: { kind: "key", key: "Enter" } as never,
      }),
    ).rejects.toThrow(/unsupported_key/);
  }, 60_000);

  it("releases the browser-side context when the session expires", async () => {
    const { expireSession, getSession } = await import("@/lib/browser/sessions");
    const { persistentState } = await import("@/lib/browser/cdp-adapter");
    const id = created[0];

    await expireSession(orgA, id);
    const row = (await getSession(orgA, id)) as unknown as Row;
    expect(row.status).toBe("expired");

    // After disposal the context is gone, so reading it must fail rather than return a stale page.
    const state = await persistentState(row);
    expect(state.ok).toBe(false);
  }, 60_000);
});
