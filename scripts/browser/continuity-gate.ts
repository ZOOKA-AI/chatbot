/**
 * Final browser continuity gate.
 *
 * One question, answered with evidence instead of opinion: does a browser session that ZOOKA-AI
 * created itself still exist, with its cookies and local storage, after the process that created it
 * is gone, without letting another workspace read it?
 *
 * The parent process owns only the engine (a real Chromium with a fixed debugging port) and the test
 * page server. Every "worker" is a separate OS process that exits when its step is done, which is
 * the closest honest stand-in for a serverless function returning a response.
 *
 * Run: node scripts/browser/continuity-gate.ts
 * Exit code 0 means every assertion passed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateInSession,
  captureSessionScreenshot,
  clickInSession,
  createPersistentSession,
  disposePersistentSession,
  expireIdleSessions,
  listTargets,
  readBrowserState,
  seedBrowserState,
  type PersistentHandle,
} from "../../lib/browser/persistent.ts";

const CHROME = "/root/.cache/ms-playwright/chromium-1161/chrome-linux/chrome";
const MARKER = "##GATE##";
const COOKIE_NAME = "zooka_tenant";
const COOKIE_VALUE = "tenant-a-secret";

type Assertion = { name: string; pass: boolean; detail: string };
const assertions: Assertion[] = [];

function record(name: string, pass: boolean, detail: string): void {
  assertions.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

function emit(payload: unknown): void {
  console.log(`${MARKER}${JSON.stringify(payload)}`);
}

function argOf(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function engineAlive(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

function runWorker(role: string, extra: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(process.execPath, [process.argv[1], `--role=${role}`, ...extra], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("exit", (code) => resolve({ code, out }));
  });
}

/** Read the worker's structured result line, if it produced one. */
function resultOf<T>(out: string): T | null {
  const line = out
    .split("\n")
    .reverse()
    .find((candidate) => candidate.startsWith(MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(MARKER.length)) as T;
  } catch {
    return null;
  }
}

async function workerA(endpoint: string, pageUrl: string): Promise<void> {
  const created = await createPersistentSession({
    endpoint,
    url: pageUrl,
    organizationId: "org-A",
  });
  if (!created.ok) {
    emit({ ok: false, step: "create", code: created.code, message: created.message });
    process.exit(2);
  }
  const seeded = await seedBrowserState({
    handle: created.value,
    cookie: { name: COOKIE_NAME, value: COOKIE_VALUE },
    storage: { tenant: "A", marker: "survives-worker-death" },
  });
  const state = await readBrowserState({
    handle: created.value,
    owner: { organizationId: "org-A" },
    asker: { organizationId: "org-A" },
  });
  emit({
    ok: seeded.ok && state.ok,
    handle: created.value,
    pid: process.pid,
    state: state.ok ? state.value : null,
  });
  // No cleanup on purpose: this process dying is the test.
  process.exit(0);
}

async function workerB(endpoint: string, handleJson: string): Promise<void> {
  const handle = JSON.parse(Buffer.from(handleJson, "base64").toString("utf8")) as PersistentHandle;
  emit({ pid: process.pid, endpoint });
  const read = await readBrowserState({
    handle,
    owner: { organizationId: "org-A" },
    asker: { organizationId: "org-A" },
  });
  // The adopted tab has to be drivable, not just readable: real mouse input and a real screenshot.
  const box = await evaluateInSession({
    handle,
    owner: { organizationId: "org-A" },
    asker: { organizationId: "org-A" },
    expression:
      "(() => { const r = document.getElementById('counter').getBoundingClientRect();" +
      " return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()",
  });
  let clicked = 0;
  if (box.ok && box.value && typeof box.value === "object") {
    const point = box.value as { x: number; y: number };
    const press = await clickInSession({
      handle,
      owner: { organizationId: "org-A" },
      asker: { organizationId: "org-A" },
      x: point.x,
      y: point.y,
    });
    if (press.ok) {
      const counter = await evaluateInSession({
        handle,
        owner: { organizationId: "org-A" },
        asker: { organizationId: "org-A" },
        expression: "Number(localStorage.getItem('counter') || 0)",
      });
      clicked = counter.ok ? Number(counter.value ?? 0) : 0;
    }
  }
  const shot = await captureSessionScreenshot({
    handle,
    owner: { organizationId: "org-A" },
    asker: { organizationId: "org-A" },
  });
  emit({
    ok: read.ok,
    handle,
    pid: process.pid,
    state: read.ok ? read.value : null,
    code: read.ok ? null : read.code,
    counterAfterClick: clicked,
    screenshot: shot.ok ? shot.value : null,
  });
  process.exit(0);
}

async function workerC(endpoint: string, pageUrl: string, handleA: string): Promise<void> {
  const handle = JSON.parse(Buffer.from(handleA, "base64").toString("utf8")) as PersistentHandle;

  // Tenant B builds its own session inside the same engine process.
  const created = await createPersistentSession({
    endpoint,
    url: pageUrl,
    organizationId: "org-B",
  });
  if (!created.ok) {
    emit({ ok: false, step: "create_b", code: created.code });
    process.exit(2);
  }
  await seedBrowserState({
    handle: created.value,
    cookie: { name: COOKIE_NAME, value: "tenant-b-secret" },
    storage: { tenant: "B" },
  });
  const ownState = await readBrowserState({
    handle: created.value,
    owner: { organizationId: "org-B" },
    asker: { organizationId: "org-B" },
  });

  // Tenant B tries to read tenant A's handle using its own workspace.
  const crossRead = await readBrowserState({
    handle,
    owner: { organizationId: "org-A" },
    asker: { organizationId: "org-B" },
  });

  // Tenant B claims tenant A's handle as if it owned it.
  // Tenant B claims tenant A's context id as if it were its own: the handle was signed for org-A,
  // so the claim cannot validate.
  const forged = await readBrowserState({
    handle: { ...handle, signature: handle.signature },
    owner: { organizationId: "org-B" },
    asker: { organizationId: "org-B" },
  });

  emit({
    ok: ownState.ok,
    handleB: created.value,
    ownState: ownState.ok ? ownState.value : null,
    crossReadCode: crossRead.ok ? "read_allowed" : crossRead.code,
    forgedReadCode: forged.ok ? "read_allowed" : forged.code,
    pid: process.pid,
  });
  process.exit(0);
}

async function workerD(
  endpoint: string,
  handleA: string,
  handleB: string,
): Promise<void> {
  const a = JSON.parse(Buffer.from(handleA, "base64").toString("utf8")) as PersistentHandle;
  const b = JSON.parse(Buffer.from(handleB, "base64").toString("utf8")) as PersistentHandle;
  const now = Date.now();
  const sweep = await expireIdleSessions({
    endpoint,
    records: [
      { handle: a, lastSeenAt: now - 30 * 60_000 },
      { handle: b, lastSeenAt: now },
    ],
    maxIdleMs: 5 * 60_000,
    now,
  });
  const after = await listTargets(endpoint);
  const disposed = await disposePersistentSession(b);
  const last = await listTargets(endpoint);
  emit({
    ok: sweep.ok && after.ok && disposed.ok && last.ok,
    sweep: sweep.ok ? sweep.value : null,
    targetsAfterSweep: after.ok ? after.value : null,
    disposeB: disposed.ok,
    targetsAtEnd: last.ok ? last.value : null,
  });
  process.exit(0);
}

async function parent(): Promise<void> {
  const enginePort = 19222;
  const pagePort = 18080;
  const endpoint = `http://127.0.0.1:${enginePort}`;
  const pageUrl = `http://127.0.0.1:${pagePort}/`;
  const profile = await mkdtemp(join(tmpdir(), "zooka-gate-"));

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>ZOOKA Continuity Gate</title></head>" +
        "<body><h1 id=proof>continuity gate</h1>" +
        "<button id=counter style='width:120px;height:40px' " +
        "onclick=\"localStorage.setItem('counter', String(Number(localStorage.getItem('counter')||0)+1))\">" +
        "count</button></body></html>",
    );
  });
  await new Promise<void>((resolve) => server.listen(pagePort, "127.0.0.1", resolve));
  console.log(`page server on ${pageUrl}`);

  // Step 1: a persistent Chromium that is not tied to any worker.
  const engine = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${enginePort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let engineStderr = "";
  engine.stderr?.on("data", (chunk) => {
    engineStderr = (engineStderr + String(chunk)).slice(-2000);
  });
  let up = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await engineAlive(endpoint)) {
      up = true;
      break;
    }
    await sleep(250);
  }
  record("1. persistent Chromium started", up, up ? `engine ${endpoint}` : engineStderr);
  if (!up) {
    server.close();
    engine.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true });
    process.exit(1);
  }

  try {
    // Steps 2-5: worker A creates the session itself and seeds state.
    const a = await runWorker("A", [`--endpoint=${endpoint}`, `--page=${pageUrl}`]);
    const aResult = resultOf<{
      ok: boolean;
      handle: PersistentHandle;
      pid: number;
      state: { url: string; cookies: { name: string; value: string }[]; localStorage: Record<string, string>; title: string } | null;
    }>(a.out);
    const aCookie = aResult?.state?.cookies.find((cookie) => cookie.name === COOKIE_NAME);
    record(
      "2. app creates its own browser context + tab",
      Boolean(aResult?.ok && aResult.handle.browserContextId && aResult.handle.targetId),
      aResult ? `ctx=${aResult.handle.browserContextId.slice(0, 8)} tab=${aResult.handle.targetId.slice(0, 8)}` : a.out.slice(-300),
    );
    record(
      "3. navigate + 4. cookie and local storage set",
      Boolean(aCookie?.value === COOKIE_VALUE && aResult?.state?.localStorage.tenant === "A"),
      `cookie=${aCookie?.value ?? "none"} storage=${JSON.stringify(aResult?.state?.localStorage ?? {})}`,
    );
    record(
      "5. identifiers recorded before the worker dies",
      Boolean(aResult?.handle && aResult.state?.url === pageUrl),
      `url=${aResult?.state?.url ?? "none"} workerPid=${aResult?.pid ?? "?"}`,
    );

    // Step 6: the worker is gone, and the engine is not.
    const stillAlive = await engineAlive(endpoint);
    record(
      "6. application worker terminated",
      a.code === 0 && stillAlive,
      `worker exit=${a.code} engine alive=${stillAlive}`,
    );

    const b64 = Buffer.from(JSON.stringify(aResult?.handle ?? {})).toString("base64");

    // Steps 7-9: a completely separate worker reconnects to the same tab and state.
    const b = await runWorker("B", [`--endpoint=${endpoint}`, `--handle=${b64}`]);
    const bResult = resultOf<{
      ok: boolean;
      pid: number;
      code: string | null;
      state: { url: string; title: string; cookies: { name: string; value: string }[]; localStorage: Record<string, string> } | null;
    }>(b.out);
    const bCookie = bResult?.state?.cookies.find((cookie) => cookie.name === COOKIE_NAME);
    record(
      "7. separate worker started",
      Boolean(bResult && bResult.pid !== aResult?.pid && bResult.pid > 0),
      `workerPid=${bResult?.pid ?? "?"} (was ${aResult?.pid ?? "?"})`,
    );
    record(
      "8. reconnected to the SAME context and tab",
      Boolean(bResult?.ok),
      bResult?.ok ? `ctx=${aResult?.handle.browserContextId.slice(0, 8)} tab=${aResult?.handle.targetId.slice(0, 8)}` : `code=${bResult?.code ?? "none"}`,
    );
    record(
      "9. URL, cookie, storage and title preserved",
      Boolean(
        bResult?.state?.url === pageUrl &&
          bCookie?.value === COOKIE_VALUE &&
          bResult?.state?.localStorage.tenant === "A" &&
          bResult?.state?.title === "ZOOKA Continuity Gate",
      ),
      `url=${bResult?.state?.url ?? "none"} title=${bResult?.state?.title ?? "none"} cookie=${bCookie?.value ?? "none"} storage=${JSON.stringify(bResult?.state?.localStorage ?? {})}`,
    );

    const bExtra = bResult as unknown as {
      counterAfterClick?: number;
      screenshot?: { bytes: number } | null;
    };
    record(
      "9b. adopted tab is drivable (real click changes state)",
      bExtra.counterAfterClick === 1,
      `counterAfterClick=${bExtra.counterAfterClick ?? "none"}`,
    );
    record(
      "9c. adopted tab can be captured",
      Boolean(bExtra.screenshot && bExtra.screenshot.bytes > 1000),
      `pngBytes=${bExtra.screenshot?.bytes ?? "none"}`,
    );

    // Step 10: another workspace can neither read nor borrow that session.
    const c = await runWorker("C", [`--endpoint=${endpoint}`, `--page=${pageUrl}`, `--handle=${b64}`]);
    const cResult = resultOf<{
      ok: boolean;
      handleB: PersistentHandle;
      ownState: { cookies: { name: string; value: string }[] } | null;
      crossReadCode: string;
      forgedReadCode: string;
    }>(c.out);
    const bLeak = cResult?.ownState?.cookies.find((cookie) => cookie.name === COOKIE_NAME);
    record(
      "10a. tenant B session has its own cookie jar",
      Boolean(bLeak?.value === "tenant-b-secret"),
      `tenantBCookie=${bLeak?.value ?? "none"}`,
    );
    record(
      "10b. tenant B cannot read tenant A's tab",
      cResult?.crossReadCode === "forbidden_workspace",
      `code=${cResult?.crossReadCode ?? "none"}`,
    );
    record(
      "10c. tenant B claiming the handle is refused",
      cResult?.forgedReadCode === "target_gone" ||
        cResult?.forgedReadCode === "context_mismatch" ||
        cResult?.forgedReadCode === "forbidden_workspace",
      `code=${cResult?.forgedReadCode ?? "none"}`,
    );

    // Step 11: idle expiry closes abandoned contexts and leaves live ones alone.
    const bB64 = Buffer.from(JSON.stringify(cResult?.handleB ?? {})).toString("base64");
    const d = await runWorker("D", [`--endpoint=${endpoint}`, `--handle=${b64}`, `--handleB=${bB64}`]);
    const dResult = resultOf<{
      ok: boolean;
      sweep: { expired: string[]; kept: string[] } | null;
      targetsAfterSweep: { targetId: string; browserContextId: string }[] | null;
      disposeB: boolean;
      targetsAtEnd: { targetId: string; browserContextId: string }[] | null;
    }>(d.out);
    const aTargetId = aResult?.handle.targetId ?? "";
    const bTargetId = cResult?.handleB.targetId ?? "";
    record(
      "11a. idle context expired, live context kept",
      Boolean(
        dResult?.sweep?.expired.includes(aTargetId) && dResult?.sweep?.kept.includes(bTargetId),
      ),
      `expired=${dResult?.sweep?.expired.length ?? 0} kept=${dResult?.sweep?.kept.length ?? 0}`,
    );
    record(
      "11b. expired tab is gone from the engine",
      Boolean(dResult?.targetsAfterSweep?.every((target) => target.targetId !== aTargetId)),
      `targets=${dResult?.targetsAfterSweep?.length ?? "?"}`,
    );
    const leaked = (dResult?.targetsAtEnd ?? []).filter(
      (target) =>
        target.targetId === aTargetId ||
        target.targetId === bTargetId ||
        target.browserContextId === aResult?.handle.browserContextId ||
        target.browserContextId === cResult?.handleB.browserContextId,
    );
    record(
      "11c. explicit dispose removes the session's context",
      Boolean(dResult?.disposeB && leaked.length === 0),
      `engineTargetsLeft=${dResult?.targetsAtEnd?.length ?? "?"} ours=${leaked.length}`,
    );
  } finally {
    engine.kill("SIGKILL");
    server.close();
    await rm(profile, { recursive: true, force: true });
  }

  const failed = assertions.filter((assertion) => !assertion.pass);
  console.log("");
  console.log(
    `${assertions.length - failed.length}/${assertions.length} assertions passed`,
  );
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const assertion of failed) console.log(` - ${assertion.name}: ${assertion.detail}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

const role = argOf("role");
const endpointArg = argOf("endpoint");
const pageArg = argOf("page");
const handleArg = argOf("handle");
const handleBArg = argOf("handleB");

if (!role) {
  await parent();
} else if (role === "A" && endpointArg && pageArg) {
  await workerA(endpointArg, pageArg);
} else if (role === "B" && endpointArg && handleArg) {
  await workerB(endpointArg, handleArg);
} else if (role === "C" && endpointArg && pageArg && handleArg) {
  await workerC(endpointArg, pageArg, handleArg);
} else if (role === "D" && endpointArg && handleArg && handleBArg) {
  await workerD(endpointArg, handleArg, handleBArg);
} else {
  console.error("bad arguments", { role, endpointArg });
  process.exit(2);
}
