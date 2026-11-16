import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { hash, compare } from "bcrypt-ts";
import { afterAll, beforeAll, beforeEach, test, vi } from "vitest";

/**
 * Two proofs the local unit tests could not give.
 *
 * 1. The real handler, served over real HTTP (loopback), so the headers are read
 *    off the wire instead of asserted on a Response object — and the data comes
 *    from a real Postgres engine (PGlite), with synthetic rows only.
 * 2. An actual restore: the full export is written into a fresh empty database and
 *    a user can still authenticate there. That is the difference between the
 *    restoreReady flag and restoreReady being true.
 */
const TABLES = [
  "User", "Organization", "OrganizationMember", "Invitation", "Subscription",
  "UsageEvent", "Chat", "Message", "Message_v2", "Vote", "Vote_v2",
  "Document", "Suggestion", "Stream",
] as const;

const { db } = vi.hoisted(() => ({ db: { instance: null as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({
  default: () => ({
    unsafe: async (query: string) => {
      const pg = db.instance as PGlite;
      const result = await pg.query<Record<string, unknown>>(query);
      return result.rows;
    },
    end: async () => undefined,
  }),
}));

import { GET } from "@/app/api/admin/backup/route";

const TOKEN = "synthetic-preview-token";
let server: ReturnType<typeof createServer>;
let base = "";
let pg: PGlite;

/**
 * Serves the route exactly as Next would route it: GET to the handler, any other
 * verb refused with 405 (the route exports no write handler). Nothing about the
 * production credentials path changes; this is a loopback harness.
 */
function handler(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const url = new URL(req.url ?? "/", base);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET", "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  void GET(new Request(url, { method: "GET", headers })).then(async (response) => {
    const body = await response.text();
    const out: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      out[key] = value;
    });
    res.writeHead(response.status, out);
    res.end(body);
  });
}

beforeAll(async () => {
  pg = new PGlite();
  db.instance = pg;
  for (const table of TABLES) {
    const columns = table === "User"
      ? `id text primary key, email text not null, password text`
      : table === "Organization"
        ? `id text primary key, name text not null`
        : `id text primary key`;
    await pg.exec(`create table "${table}" (${columns})`);
  }
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pg.close();
});

beforeEach(async () => {
  process.env.BACKUP_TOKEN = TOKEN;
  process.env.DATABASE_URL = "postgres://synthetic@127.0.0.1:5432/synthetic";
  for (const table of TABLES) await pg.exec(`delete from "${table}"`);
});

test("over real HTTP: refusals carry the security headers and touch nothing", async () => {
  for (const token of [null, "wrong-token"]) {
    const response = await fetch(`${base}/api/admin/backup`, {
      headers: token ? { "x-backup-token": token } : {},
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.ok(response.headers.get("x-request-id"), "a request id is returned for support");
    const body = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["error", "requestId"]);
  }

  const post = await fetch(`${base}/api/admin/backup`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
});

test("over real HTTP: 200 full and 200 redacted, headers and leaks checked on the wire", async () => {
  await pg.exec(`
    insert into "User" (id, email, password) values
      ('u1','owner@example.test','$2b$10$abcdefghijklmnopqrstuv'),
      ('u2','second@example.test','$2b$10$zyxwvutsrqponmlkjihgfe');
    insert into "Organization" (id, name) values ('o1','Synthetic Workspace');
  `);

  const full = await fetch(`${base}/api/admin/backup`, { headers: { "x-backup-token": TOKEN } });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
  assert.equal(full.headers.get("pragma"), "no-cache");
  assert.equal(full.headers.get("x-robots-tag"), "noindex, nofollow");
  const fullBody = (await full.json()) as {
    exportType: string; restoreReady: boolean; rowCount: number;
    tables: Record<string, Record<string, unknown>[]>;
  };
  assert.equal(fullBody.exportType, "full");
  assert.equal(fullBody.restoreReady, true);
  assert.equal(fullBody.tables.User.length, 2);
  // The assertion is on the value's shape, never printing the payload.
  assert.match(String(fullBody.tables.User[0].password), /^\$2b\$10\$/);

  const redacted = await fetch(`${base}/api/admin/backup?mode=redacted`, {
    headers: { "x-backup-token": TOKEN },
  });
  assert.equal(redacted.status, 200);
  assert.equal(redacted.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
  const redactedBody = (await redacted.json()) as typeof fullBody;
  assert.equal(redactedBody.exportType, "redacted");
  assert.equal(redactedBody.restoreReady, false);
  const serialized = JSON.stringify(redactedBody);
  assert.ok(!serialized.includes("$2b$10$"), "no hash survives redaction");
  assert.ok(!serialized.includes(TOKEN), "the caller token is never echoed");
  assert.equal(redactedBody.tables.User[0].password, "[redacted]");
  assert.equal(redactedBody.tables.User[0].email, "owner@example.test");
});

test("over real HTTP: a successful dump writes nothing to the log", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await pg.exec(`insert into "User" (id,email,password) values ('u1','a@example.test','h')`);

  const response = await fetch(`${base}/api/admin/backup`, { headers: { "x-backup-token": TOKEN } });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(log.mock.calls.length + warn.mock.calls.length + error.mock.calls.length, 0,
    "a successful export must leave no trace containing row data");
  vi.restoreAllMocks();
});

test("restore: the full export rebuilds a working database, the redacted one cannot", async () => {
  const password = "Owner-Password-2026!";
  const passwordHash = await hash(password, 10);
  await pg.exec(`
    insert into "User" (id, email, password) values ('u1','owner@example.test','${passwordHash}');
    insert into "Organization" (id, name) values ('o1','Synthetic Workspace');
    insert into "OrganizationMember" (id) values ('m1'), ('m2');
  `);

  const exported = (await (
    await fetch(`${base}/api/admin/backup`, { headers: { "x-backup-token": TOKEN } })
  ).json()) as { tables: Record<string, Record<string, unknown>[]> };

  // A brand new, empty database: the restore target.
  const restored = new PGlite();
  for (const table of TABLES) {
    const columns = table === "User"
      ? `id text primary key, email text not null, password text`
      : table === "Organization"
        ? `id text primary key, name text not null`
        : `id text primary key`;
    await restored.exec(`create table "${table}" (${columns})`);
  }

  for (const [table, rows] of Object.entries(exported.tables)) {
    for (const row of rows) {
      const keys = Object.keys(row);
      const columns = keys.map((key) => `"${key}"`).join(", ");
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
      await restored.query(
        `insert into "${table}" (${columns}) values (${placeholders})`,
        keys.map((key) => row[key] as string)
      );
    }
  }

  const users = await restored.query<{ id: string; email: string; password: string }>(
    `select id, email, password from "User"`
  );
  assert.equal(users.rows.length, 1);
  assert.equal(users.rows[0].email, "owner@example.test");
  assert.equal(
    await compare(password, users.rows[0].password),
    true,
    "the restored hash must authenticate the original password"
  );
  const members = await restored.query<{ n: number }>(
    `select count(*)::int as n from "OrganizationMember"`
  );
  assert.equal(members.rows[0].n, 2, "row counts survive the round trip");
  await restored.close();

  // The redacted export is not a backup: the hash is gone, so nobody can log in.
  const scrubbed = (await (
    await fetch(`${base}/api/admin/backup?mode=redacted`, { headers: { "x-backup-token": TOKEN } })
  ).json()) as { restoreReady: boolean; tables: Record<string, Record<string, unknown>[]> };
  assert.equal(scrubbed.restoreReady, false);
  assert.equal(scrubbed.tables.User[0].password, "[redacted]");
  // bcrypt rejects a non-hash outright, so "cannot authenticate" is proved by
  // the comparison failing rather than by a boolean false.
  const cannotAuthenticate = await compare(
    password,
    String(scrubbed.tables.User[0].password)
  ).then(
    (matched) => matched,
    () => false
  );
  assert.equal(cannotAuthenticate, false, "a redacted export must not restore logins");
});
