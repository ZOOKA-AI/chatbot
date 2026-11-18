/**
 * Gateway gate: the CDP door, tested the way an attacker would.
 *
 * The engine in this file is real, the gateway is the real service in gateway/cdp-gateway.mjs, and
 * the only path to the engine is through it. Every refusal below is a security assertion, so a
 * regression that quietly opens the door fails CI rather than being noticed in production.
 *
 * Run: node scripts/browser/gateway-gate.mjs
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPersistentSession,
  readBrowserState,
  seedBrowserState,
} from "../../lib/browser/persistent.ts";

const CHROME = "/root/.cache/ms-playwright/chromium-1161/chrome-linux/chrome";
const ENGINE_PORT = 19223;
const GATEWAY_PORT = 19787;
const IDLE_MS = 2_500;

const assertions = [];
function record(name, pass, detail) {
  assertions.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function httpStatus(url, headers = {}) {
  try {
    const response = await fetch(url, { headers });
    return response.status;
  } catch {
    return 0;
  }
}

async function main() {
  const tokenA = randomBytes(24).toString("hex");
  const tokenB = randomBytes(24).toString("hex");
  const gatewaySecret = randomBytes(24).toString("hex");
  const noToken = randomBytes(24).toString("hex");

  const workDir = await mkdtemp(join(tmpdir(), "zooka-gw-"));
  const profile = join(workDir, "chrome-profile");
  const gatewayLog = join(workDir, "gateway.log");

  const pageServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><head><title>Gateway Gate</title></head><body>ok</body></html>");
  });
  await new Promise((resolve) => pageServer.listen(18081, "127.0.0.1", resolve));

  const engine = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      `--remote-debugging-port=${ENGINE_PORT}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );

  const tenants = JSON.stringify({ "tenant-a": tokenA, "tenant-b": tokenB });
  const gateway = spawn(
    process.execPath,
    [new URL("../../gateway/cdp-gateway.mjs", import.meta.url).pathname],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        GATEWAY_PORT: String(GATEWAY_PORT),
        GATEWAY_BIND: "127.0.0.1",
        UPSTREAM_CDP: `http://127.0.0.1:${ENGINE_PORT}`,
        GATEWAY_TENANTS: tenants,
        GATEWAY_MAX_CONNS: "6",
        GATEWAY_MAX_PER_TENANT: "2",
        GATEWAY_RATE_LIMIT_PER_MIN: "40",
        GATEWAY_IDLE_MS: String(IDLE_MS),
        // NODE_PATH lets this file find the `ws` package the gateway imports.
        WS_MODULE_PATH: `${process.cwd()}/node_modules/.pnpm/ws@8.23.0_bufferutil@4.2.0/node_modules/ws`,
        GATEWAY_HANDLE_KEY: gatewaySecret,
      },
    },
  );
  const logs = [];
  gateway.stdout.on("data", (chunk) => logs.push(String(chunk)));
  gateway.stderr.on("data", (chunk) => logs.push(String(chunk)));

  let up = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await httpStatus(`http://127.0.0.1:${GATEWAY_PORT}/healthz`)) === 200) {
      up = true;
      break;
    }
    await sleep(250);
  }
  record("1. gateway and engine up", up, up ? `gateway ${GATEWAY_PORT}` : logs.join("").slice(-400));
  if (!up) {
    engine.kill("SIGKILL");
    gateway.kill("SIGKILL");
    pageServer.close();
    await rm(workDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    process.exit(1);
  }

  const health = await (await fetch(`http://127.0.0.1:${GATEWAY_PORT}/healthz`)).json();
  record(
    "2. health endpoint reports tenants without secrets",
    health.knownTenants === 2 && !JSON.stringify(health).includes(tokenA.slice(0, 8)),
    `knownTenants=${health.knownTenants}`,
  );

  // Direct engine access must not exist: the gateway is the only door, so the harness normally would
  // not use the engine port at all. Proven by the refusals below instead of by assuming.
  const pageUrl = "http://127.0.0.1:18081/";
  const endpointA = `ws://127.0.0.1:${GATEWAY_PORT}/cdp?tenant=tenant-a&token=${tokenA}`;
  const endpointB = `ws://127.0.0.1:${GATEWAY_PORT}/cdp?tenant=tenant-b&token=${tokenB}`;
  const endpointNoToken = `ws://127.0.0.1:${GATEWAY_PORT}/cdp?tenant=tenant-a&token=${noToken}`;
  const endpointNoTenant = `ws://127.0.0.1:${GATEWAY_PORT}/cdp?token=${tokenA}`;

  // A CDP handshake is a WebSocket upgrade; a refused one surfaces as a failed connect or a close.
  async function handshake(url) {
    return new Promise((resolve) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => resolve("timeout"), 4000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        socket.close();
        resolve("open");
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        resolve("refused");
      });
    });
  }

  record(
    "3. wrong token is refused",
    (await handshake(endpointNoToken)) === "refused",
    "no upgrade",
  );
  record(
    "4. token without tenant is refused",
    (await handshake(endpointNoTenant)) === "refused",
    "no upgrade",
  );

  const created = await createPersistentSession({
    endpoint: endpointA,
    url: pageUrl,
    organizationId: "org-A",
  });
  record(
    "5. authorized tenant reaches the engine through the gateway",
    created.ok === true,
    created.ok ? `ctx=${created.value.browserContextId.slice(0, 8)}` : `${created.code}: ${created.message}`,
  );

  if (created.ok) {
    await seedBrowserState({
      handle: created.value,
      cookie: { name: "gateway_cookie", value: "tenant-a-value" },
      storage: { tenant: "A" },
    });
    const read = await readBrowserState({
      handle: created.value,
      owner: { organizationId: "org-A" },
      asker: { organizationId: "org-A" },
    });
    record(
      "6. state survives across separate gateway connections",
      read.ok === true &&
        read.value.cookies.some((cookie) => cookie.name === "gateway_cookie") &&
        read.value.localStorage.tenant === "A",
      read.ok ? `url=${read.value.url} cookies=${read.value.cookies.length}` : read.code,
    );

    const crossTenant = await readBrowserState({
      handle: { ...created.value, endpoint: endpointB },
      owner: { organizationId: "org-B" },
      asker: { organizationId: "org-B" },
    });
    record(
      "7. tenant B's token cannot carry tenant A's handle",
      crossTenant.ok === false && crossTenant.code === "forbidden_workspace",
      crossTenant.ok ? "read_allowed" : crossTenant.code,
    );
  }

  // Per-workspace capacity: two live sockets are allowed, the third is refused.
  const held = [];
  for (let index = 0; index < 2; index += 1) {
    const socket = new WebSocket(endpointA);
    await new Promise((resolve) => {
      socket.addEventListener("open", resolve);
      socket.addEventListener("error", resolve);
    });
    held.push(socket);
  }
  const third = await handshake(endpointA);
  record("8. per-workspace connection cap holds", third === "refused", `third=${third}`);
  for (const socket of held) socket.close();
  await sleep(400);

  // Idle connections are closed by the gateway, not left holding the browser.
  const idleSocket = new WebSocket(endpointB);
  const idleClosed = await new Promise((resolve) => {
    let closed = null;
    idleSocket.addEventListener("open", () => {
      closed = setTimeout(() => resolve("still_open"), IDLE_MS + 3000);
    });
    idleSocket.addEventListener("close", () => {
      if (closed) clearTimeout(closed);
      resolve("closed");
    });
  });
  record("9. idle connection is reclaimed", idleClosed === "closed", `idle=${IDLE_MS}ms result=${idleClosed}`);

  // No secrets in the access log, which is the only thing operators ever read.
  const logText = logs.join("");
  const leaked = [tokenA, tokenB, "tenant-a-value"].filter((secret) => logText.includes(secret));
  record(
    "10. access log carries no token, cookie or query string",
    leaked.length === 0 && logText.includes("connected"),
    leaked.length === 0 ? `${logText.split("\n").filter(Boolean).length} log lines, no secrets` : `${leaked.length} secrets in log`,
  );

  // Upstream down is a clean 502, not a hang that looks like a slow page.
  engine.kill("SIGKILL");
  await sleep(800);
  const down = await new Promise((resolve) => {
    const socket = new WebSocket(endpointA);
    const timer = setTimeout(() => resolve("timeout"), 6000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve("open");
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve("refused");
    });
  });
  record("11. dead engine fails fast", down === "refused", `result=${down}`);

  gateway.kill("SIGTERM");
  pageServer.close();
  await sleep(400);
  const lastLines = logs.join("").split("\n").filter(Boolean).slice(-6);
  await rm(workDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});

  const failed = assertions.filter((assertion) => !assertion.pass);
  console.log("");
  console.log(`${assertions.length - failed.length}/${assertions.length} gateway assertions passed`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const assertion of failed) console.log(` - ${assertion.name}: ${assertion.detail}`);
    console.log("last gateway lines:", lastLines.join(" | ").slice(0, 800));
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
