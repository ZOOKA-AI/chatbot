import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

/**
 * Security tests for the credential dump. They assert the two things that were
 * actually wrong in production: the response was cacheable while carrying
 * password hashes, and a failure echoed the driver message. Both the success and
 * the failure path are covered, and the refusal paths prove no database work
 * happens at all before the token is verified.
 */
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
    throwOnSelect: false,
    calls: 0,
    ended: 0,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({
  default: () => ({
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
  }),
}));

import { GET, redactRow } from "@/app/api/admin/backup/route";

const TOKEN = "test-backup-token-value";

function request(header?: string) {
  return new Request("https://zooka-ai.com/api/admin/backup", {
    method: "GET",
    headers: header === undefined ? {} : { "x-backup-token": header },
  });
}

beforeEach(() => {
  state.rows = [
    { id: "u1", email: "a@example.test", password: "$2b$10$hash", hashedPassword: "x" },
  ];
  state.throwOnSelect = false;
  state.calls = 0;
  state.ended = 0;
  process.env.BACKUP_TOKEN = TOKEN;
  process.env.DATABASE_URL = "postgres://user:pass@db.internal:5432/app";
});

afterEach(() => {
  delete process.env.BACKUP_TOKEN;
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

test("no token, a wrong token, or a missing secret is refused before any query", async () => {
  for (const header of [undefined, "", "wrong", TOKEN.toUpperCase()]) {
    const response = await GET(request(header as string | undefined));
    assert.equal(response.status, 401, `header ${String(header)} must be refused`);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }
  assert.equal(state.calls, 0, "the database must not be touched on refusal");

  delete process.env.BACKUP_TOKEN;
  const noSecret = await GET(request(TOKEN));
  assert.equal(noSecret.status, 401, "unset BACKUP_TOKEN must fail closed");
});

test("a successful dump is never cacheable and carries no credentials", async () => {
  const response = await GET(request(TOKEN));
  assert.equal(response.status, 200);

  const cache = response.headers.get("cache-control") ?? "";
  assert.match(cache, /no-store/);
  assert.match(cache, /private/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);

  const payload = (await response.json()) as {
    tables: Record<string, Record<string, unknown>[]>;
  };
  const body = JSON.stringify(payload);
  assert.ok(!body.includes("$2b$10$hash"), "password hash must not be in the payload");
  assert.ok(!body.includes('"x"'), "sensitive values must not survive");
  assert.equal(payload.tables.User[0].password, "[redacted]");
  assert.equal(payload.tables.User[0].hashedPassword, "[redacted]");
  assert.equal(payload.tables.User[0].email, "a@example.test");
  assert.equal(state.ended, 1, "the connection must always be closed");
});

test("a database failure returns a generic error and keeps the detail in the log", async () => {
  state.throwOnSelect = true;
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await GET(request(TOKEN));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "backup_failed" });
  assert.ok(!JSON.stringify(body).includes("password authentication"), "no driver text");

  const cache = response.headers.get("cache-control") ?? "";
  assert.match(cache, /no-store/);
  assert.equal(logged.mock.calls.length, 1, "the detail is logged server-side");
  assert.match(String(logged.mock.calls[0][1]), /password authentication/);
});

test("redaction is driven by the column name, so new secret columns are covered", () => {
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
  assert.equal(clean.password, "[redacted]");
  assert.equal(clean.hashedPassword, "[redacted]");
  assert.equal(clean.accessToken, "[redacted]");
  assert.equal(clean.refresh_token, "[redacted]");
  assert.equal(clean.apiKey, "[redacted]");
  assert.equal(clean.api_key, "[redacted]");
  assert.equal(clean.clientSecret, "[redacted]");
  assert.equal(clean.salt, "[redacted]");
  assert.equal(clean.email, "a@example.test");
  assert.equal(clean.role, "owner");
});
