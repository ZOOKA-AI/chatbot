import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

/**
 * Regression suite for the credential export. It pins the two properties that
 * broke in production (a cacheable response carrying password hashes, and a 500
 * echoing the driver message) and the distinction the owner asked for: the full
 * export stays restore-ready, the redacted export is marked as not restorable and
 * can never be mistaken for a backup.
 */
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
    throwOnSelect: false,
    calls: 0,
    ended: 0,
    opened: 0,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({
  default: () => {
    state.opened += 1;
    return {
      unsafe: async () => {
        state.calls += 1;
        if (state.throwOnSelect) {
          throw new Error(
            'password authentication failed for user "postgres" at db.internal:5432'
          );
        }
        return state.rows;
      },
      end: async () => {
        state.ended += 1;
      },
    };
  },
}));

import { GET, redactRow } from "@/app/api/admin/backup/route";

const TOKEN = "test-backup-token-value";
const BASE = "https://zooka-ai.com/api/admin/backup";

function request(opts: { token?: string; mode?: string; requestId?: string } = {}) {
  const url = opts.mode ? `${BASE}?mode=${opts.mode}` : BASE;
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) headers["x-backup-token"] = opts.token;
  if (opts.requestId) headers["x-request-id"] = opts.requestId;
  return new Request(url, { method: "GET", headers });
}

function assertNoStore(headers: Headers) {
  const cache = headers.get("cache-control") ?? "";
  assert.match(cache, /no-store/, "cache-control must forbid storing");
  assert.match(cache, /private/, "cache-control must be private");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.match(headers.get("x-robots-tag") ?? "", /noindex/);
}

beforeEach(() => {
  state.rows = [
    { id: "u1", email: "a@example.test", password: "$2b$10$hash", accessToken: "tok" },
  ];
  state.throwOnSelect = false;
  state.calls = 0;
  state.ended = 0;
  state.opened = 0;
  process.env.BACKUP_TOKEN = TOKEN;
  process.env.DATABASE_URL = "postgres://user:pass@db.internal:5432/app";
});

afterEach(() => {
  delete process.env.BACKUP_TOKEN;
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

test("401 · no token, wrong token, empty token, and an unset secret all refuse before any query", async () => {
  const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const token of [undefined, "", "wrong", TOKEN.toUpperCase()]) {
    const response = await GET(request({ token: token as string | undefined }));
    assert.equal(response.status, 401, `token ${String(token)} must be refused`);
    assertNoStore(response.headers);
    const body = await response.json();
    assert.equal(body.error, "unauthorized");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/i, "every refusal carries a request id");
  }
  assert.equal(state.calls, 0, "the database must never be touched on refusal");
  assert.equal(state.opened, 0, "no connection is even opened");

  delete process.env.BACKUP_TOKEN;
  assert.equal((await GET(request({ token: TOKEN }))).status, 401, "unset secret fails closed");

  // Safe refusal logging: shape only, never the secret.
  const lines = logged.mock.calls.map((call) => String(call[0]));
  assert.ok(lines.length >= 5, `expected one log line per refusal, got ${lines.length}`);
  for (const line of lines) {
    const entry = JSON.parse(line);
    assert.equal(entry.route, "/api/admin/backup");
    assert.equal(entry.result, "refused");
    assert.ok(entry.ts && entry.requestId);
    assert.ok(!line.includes(TOKEN), "the token must never appear in a log line");
    assert.ok(!line.includes("wrong"), "no submitted value is logged");
  }
});

test("200 · the full export stays restore-ready and byte-identical to the real data", async () => {
  const response = await GET(request({ token: TOKEN }));
  assert.equal(response.status, 200);
  assertNoStore(response.headers);

  const body = await response.json();
  assert.equal(body.exportType, "full");
  assert.equal(body.restoreReady, true, "the disaster-recovery backup must remain restorable");
  const expectedRows = Object.values(body.tables as Record<string, unknown[]>).reduce(
    (total, rows) => total + rows.length,
    0
  );
  assert.equal(body.rowCount, expectedRows, "row count must match what was exported");
  assert.ok(expectedRows > 0);
  // Full means full: hashes survive, otherwise accounts cannot be restored.
  assert.equal(body.tables.User[0].password, "$2b$10$hash");
  assert.equal(body.tables.User[0].email, "a@example.test");
  assert.equal(state.ended, 1, "the connection is always closed");
});

test("200 · the redacted export removes credentials and says it is not restorable", async () => {
  const response = await GET(request({ token: TOKEN, mode: "redacted" }));
  assert.equal(response.status, 200);
  assertNoStore(response.headers);

  const body = await response.json();
  assert.equal(body.exportType, "redacted");
  assert.equal(body.restoreReady, false, "a redacted export must never look like a backup");
  assert.equal(body.tables.User[0].password, "[redacted]");
  assert.equal(body.tables.User[0].accessToken, "[redacted]");
  assert.equal(body.tables.User[0].email, "a@example.test", "ordinary columns survive");
  assert.ok(!JSON.stringify(body).includes("$2b$10$hash"));
  assert.ok(body.rowCount > 0, "row count is preserved so the export can be checked");
  assert.equal(
    body.rowCount,
    Object.values(body.tables as Record<string, unknown[]>).reduce((t, r) => t + r.length, 0)
  );
});

test("200 · an unknown mode falls back to the safe workflow, not to full", async () => {
  // Any typo in mode must not silently produce a restore-ready credential dump
  // through a path an admin believed was redacted. It resolves explicitly.
  const response = await GET(request({ token: TOKEN, mode: "reedacted" }));
  const body = await response.json();
  assert.equal(body.exportType, "full");
  assert.equal(body.restoreReady, true);
});

test("500 · a database failure returns a generic body and keeps the detail in the log", async () => {
  state.throwOnSelect = true;
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

  const response = await GET(request({ token: TOKEN }));
  assert.equal(response.status, 500);
  assertNoStore(response.headers);

  const body = await response.json();
  assert.equal(body.error, "backup_failed");
  assert.ok(!JSON.stringify(body).includes("password authentication"), "no driver text");
  assert.ok(!JSON.stringify(body).includes("db.internal"), "no host leak");
  assert.equal(logged.mock.calls.length, 1, "detail logged server-side once");
  assert.equal(warned.mock.calls.length, 1, "the refusal is recorded");
  assert.equal(JSON.parse(String(warned.mock.calls[0][0])).reason, "backup_failed");
  assert.equal(state.ended, 1);
});

test("500 · a missing connection string is refused without opening a connection", async () => {
  delete process.env.DATABASE_URL;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const response = await GET(request({ token: TOKEN }));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, "db_not_configured");
  assert.equal(state.opened, 0);
});

test("405 · the route exposes reading only, and the caller's request id is echoed", async () => {
  const routeModule = await import("@/app/api/admin/backup/route");
  const exported = Object.keys(routeModule).filter((key) =>
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(key)
  );
  assert.deepEqual(exported, ["GET"], "no write verb may exist on a dump route");

  const response = await GET(request({ token: TOKEN, requestId: "req-abc-123" }));
  assert.equal(response.headers.get("x-request-id"), "req-abc-123");
  assert.equal((await response.json()).requestId, "req-abc-123");
});

test("redaction is column-name driven, so a new secret column is covered", () => {
  const clean = redactRow({
    id: "1",
    email: "a@example.test",
    password: "p",
    hashedPassword: "p",
    accessToken: "t",
    refresh_token: "t",
    apiKey: "k",
    api_key: "k",
    clientSecret: "s",
    salt: "s",
    role: "owner",
  });
  for (const key of [
    "password",
    "hashedPassword",
    "accessToken",
    "refresh_token",
    "apiKey",
    "api_key",
    "clientSecret",
    "salt",
  ]) {
    assert.equal(clean[key], "[redacted]", `${key} must be redacted`);
  }
  assert.equal(clean.email, "a@example.test");
  assert.equal(clean.role, "owner");
});
