#!/usr/bin/env node
/**
 * ZOOKA-AI CDP gateway.
 *
 * Chromium's DevTools endpoint is total authority over every browser context on the host: whoever can
 * speak CDP can read every cookie in every tenant's session. It therefore never leaves loopback. This
 * gateway is the only door, and it is a narrow one:
 *
 *   - one bearer token per workspace, compared in constant time;
 *   - a workspace may only reach the engine with its own token, and connection counts are capped per
 *     workspace so one tenant cannot exhaust the browser;
 *   - attempts are rate limited per workspace;
 *   - a connection that carries no traffic for IDLE_MS is closed, so an abandoned viewer cannot pin a
 *     browser forever;
 *   - the access log records tenant, event and reason only. CDP traffic contains cookies and page
 *     content, so no frame is ever logged, and tokens are stripped from anything that is.
 *
 * TLS is not terminated here on purpose. This process listens on 127.0.0.1 and is published as wss://
 * by a tunnel that terminates TLS in front of it (Cloudflare Tunnel, or Caddy), so there is exactly
 * one place where certificates live. Running it plain on a public interface is refused at start.
 */
import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// `ws` is this service's only dependency (gateway/package.json). WS_MODULE_PATH exists so a test can
// point at an already-installed copy without adding a second install step to CI.
const require = createRequire(import.meta.url);
const wsModule = process.env.WS_MODULE_PATH ? require(process.env.WS_MODULE_PATH) : require("ws");
const { WebSocket, WebSocketServer } = wsModule;

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const PORT = Number(process.env.GATEWAY_PORT ?? 8787);
const BIND = process.env.GATEWAY_BIND ?? "127.0.0.1";
const UPSTREAM = process.env.UPSTREAM_CDP ?? "http://127.0.0.1:9222";
const MAX_CONNS = Number(process.env.GATEWAY_MAX_CONNS ?? 8);
const MAX_PER_TENANT = Number(process.env.GATEWAY_MAX_PER_TENANT ?? 2);
const RATE_LIMIT_PER_MIN = Number(process.env.GATEWAY_RATE_LIMIT_PER_MIN ?? 120);
const IDLE_MS = Number(process.env.GATEWAY_IDLE_MS ?? 120_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS ?? 10_000);

/** One line per event, and never anything that could carry a secret. */
function log(event, fields = {}) {
  const safe = { ts: new Date().toISOString(), event };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "token" || key === "authorization" || key === "payload") continue;
    safe[key] = typeof value === "string" ? redact(value) : value;
  }
  console.log(JSON.stringify(safe));
}

/** Strip anything shaped like a credential from a log value. */
export function redact(value) {
  return String(value)
    .replace(/(token|key|secret|password)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\?.*$/, "");
}

function tokens() {
  const raw = process.env.GATEWAY_TENANTS?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entries = Object.entries(parsed).filter(
      ([tenant, token]) => typeof tenant === "string" && typeof token === "string" && token.length >= 24,
    );
    return entries.length > 0 ? new Map(entries) : null;
  } catch {
    return null;
  }
}

const TENANT_TOKENS = tokens();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Which workspace is calling, or null. Header first; query is accepted only for clients that cannot
 *  set headers, and is redacted from logs. */
function identify(request) {
  if (!TENANT_TOKENS) return null;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const tenant = request.headers["x-zooka-tenant"] ?? url.searchParams.get("tenant");
  const header = request.headers.authorization;
  const bearer = typeof header === "string" && header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;
  const token = bearer ?? request.headers["x-zooka-token"] ?? url.searchParams.get("token");
  if (typeof tenant !== "string" || typeof token !== "string") return null;
  const expected = TENANT_TOKENS.get(tenant);
  if (!expected || !safeEqual(token, expected)) return null;
  return tenant;
}

const attempts = new Map();
function rateLimited(tenant) {
  const now = Date.now();
  const window = attempts.get(tenant) ?? [];
  const recent = window.filter((at) => now - at < 60_000);
  recent.push(now);
  attempts.set(tenant, recent);
  return recent.length > RATE_LIMIT_PER_MIN;
}

let cachedSocketUrl = null;
let cachedAt = 0;
const URL_TTL_MS = 10_000;

async function upstreamSocket() {
  if (cachedSocketUrl && Date.now() - cachedAt < URL_TTL_MS) return cachedSocketUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${UPSTREAM}/json/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`upstream_http_${response.status}`);
    const body = await response.json();
    if (!body.webSocketDebuggerUrl) throw new Error("upstream_no_socket");
    cachedSocketUrl = body.webSocketDebuggerUrl;
    cachedAt = Date.now();
    return cachedSocketUrl;
  } finally {
    clearTimeout(timer);
  }
}

/** Open a browser-level engine socket, retrying once after invalidating the cached URL. */
async function openUpstream() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = await upstreamSocket();
    const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    const opened = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), UPSTREAM_TIMEOUT_MS);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve("open");
      });
      socket.once("error", () => {
        clearTimeout(timer);
        resolve("error");
      });
      socket.once("close", () => {
        clearTimeout(timer);
        resolve("closed");
      });
    });
    if (opened === "open") return socket;
    cachedSocketUrl = null;
    try {
      socket.terminate();
    } catch {
      /* already gone */
    }
    if (attempt === 1) throw new Error(`upstream_connect_${opened}`);
  }
  throw new Error("upstream_unreachable");
}

const connections = new Map();
const server = createServer((request, response) => {
  if (request.url?.startsWith("/healthz")) {
    const perTenant = {};
    for (const entry of connections.values()) perTenant[entry.tenant] = (perTenant[entry.tenant] ?? 0) + 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        connections: connections.size,
        perTenant,
        knownTenants: TENANT_TOKENS ? TENANT_TOKENS.size : 0,
      }),
    );
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });

server.on("upgrade", async (request, socket, head) => {
  const tenant = identify(request);
  if (!tenant) {
    log("upgrade_refused", { reason: "unauthorized" });
    socket.write("HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (rateLimited(tenant)) {
    log("upgrade_refused", { tenant, reason: "rate_limited" });
    socket.write("HTTP/1.1 429 Too Many Requests\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (connections.size >= MAX_CONNS) {
    log("upgrade_refused", { tenant, reason: "capacity" });
    socket.write("HTTP/1.1 503 Service Unavailable\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const held = [...connections.values()].filter((entry) => entry.tenant === tenant).length;
  if (held >= MAX_PER_TENANT) {
    log("upgrade_refused", { tenant, reason: "tenant_capacity" });
    socket.write("HTTP/1.1 429 Too Many Requests\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  // The engine socket is opened before the client is accepted, and one transient failure is retried
  // with a fresh URL. Chromium occasionally drops the first upgrade after another client disconnects;
  // measured, not guessed: close code 1006 on the second connection, then fine.
  let upstream;
  try {
    upstream = await openUpstream();
  } catch (error) {
    log("upgrade_refused", { tenant, reason: "upstream_unavailable", detail: String(error?.message ?? error) });
    socket.write("HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (client) => {
    const id = randomUUID();
    const entry = { id, tenant, client, upstream, lastActivity: Date.now() };
    connections.set(id, entry);
    log("connected", { tenant, id });

    const idle = setInterval(() => {
      if (Date.now() - entry.lastActivity > IDLE_MS) {
        log("closed", { tenant, id, reason: "idle" });
        try {
          client.close(1000, "idle");
        } catch {
          /* already gone */
        }
        try {
          upstream.close(1000, "idle");
        } catch {
          /* already gone */
        }
        clearInterval(idle);
      }
    }, Math.min(15_000, Math.max(1_000, Math.floor(IDLE_MS / 4))));

    const cleanup = (reason) => {
      clearInterval(idle);
      connections.delete(id);
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.close(1000, reason);
      } catch {
        /* already gone */
      }
      try {
        if (client.readyState === WebSocket.OPEN) client.close(1000, reason);
      } catch {
        /* already gone */
      }
    };

    // Buffered client frames until the engine socket is up: a WS relay that drops early frames loses
    // the first CDP command, which looks like a hung browser rather than a bug in this file.
    const pending = [];
    const flush = () => {
      while (pending.length > 0 && upstream.readyState === WebSocket.OPEN) {
        upstream.send(pending.shift());
      }
    };

    client.on("message", (data, isBinary) => {
      entry.lastActivity = Date.now();
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING) pending.push(data);
      else cleanup("upstream_closed");
    });
    upstream.on("open", flush);
    upstream.on("message", (data, isBinary) => {
      entry.lastActivity = Date.now();
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    client.on("close", () => {
      log("closed", { tenant, id, reason: "client" });
      cleanup("client");
    });
    client.on("error", () => {
      log("closed", { tenant, id, reason: "client_error" });
      cleanup("client_error");
    });
    upstream.on("close", (code, reason) => {
      log("closed", {
        tenant,
        id,
        reason: "upstream",
        code,
        detail: reason ? String(reason).slice(0, 80) : undefined,
      });
      cleanup("upstream");
    });
    upstream.on("unexpected-response", (_request, response) => {
      log("upstream_rejected", { tenant, id, status: response.statusCode });
    });
    upstream.on("error", (error) => {
      log("closed", { tenant, id, reason: "upstream_error", detail: String(error?.message ?? error) });
      cleanup("upstream_error");
    });
  });
});

if (!LOOPBACK.has(BIND) && process.env.GATEWAY_ALLOW_PUBLIC !== "true") {
  log("refused_to_start", {
    reason: "public_bind_requires_tunnel",
    detail: `bind=${BIND} would expose raw CDP; put a TLS terminator in front and keep this on loopback`,
  });
  process.exit(1);
}
if (!TENANT_TOKENS) {
  log("refused_to_start", { reason: "no_tenant_tokens", detail: "set GATEWAY_TENANTS to a JSON map of workspace tokens" });
  process.exit(1);
}

server.listen(PORT, BIND, () => {
  log("listening", { port: PORT, bind: BIND, tenants: TENANT_TOKENS.size, upstream: UPSTREAM });
});

function shutdown(signal) {
  log("shutdown", { signal });
  for (const entry of connections.values()) {
    try {
      entry.client.close(1001, "shutdown");
    } catch {
      /* already gone */
    }
  }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
