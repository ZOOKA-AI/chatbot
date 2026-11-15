import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { withCredentialThrottle } from "@/lib/auth/credential-throttle-route";
import {
  LOGIN_LIMITS,
  parseCredentials,
  readLoginLock,
  verifyCredentialAttempt,
} from "@/lib/auth/login-guard";
import { throttleModeFromEnv } from "@/lib/auth/throttle";
import {
  MemoryThrottleStore,
  PostgresThrottleStore,
  ResilientThrottleStore,
  type SqlExecutor,
  type ThrottleStore,
} from "@/lib/auth/throttle-store";

/**
 * The shared store on a real PostgreSQL engine (PGlite), the fallback when the
 * shared store is down, and the HTTP answer for a locked caller.
 *
 * PGlite proves the SQL: the atomic upsert, the window reset, and that two
 * store objects over one database count together. It does not prove the
 * postgres.js connection used in production; nothing here claims it does.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/auth_throttle.sql"),
  "utf8"
);

let pg: PGlite;
let exec: SqlExecutor;

async function applyMigration() {
  for (const part of MIGRATION.split("--> statement-breakpoint")) {
    const sql = part.trim();
    if (sql) await pg.exec(sql);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  exec = async (text, params) =>
    (await pg.query<Record<string, unknown>>(text, params)).rows;
  await applyMigration();
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`delete from "AuthThrottle"`);
});

function attempt(store: ThrottleStore, email: string, password: string, address: string, now: number) {
  const parsed = parseCredentials({ email, password });
  assert.ok(parsed);
  return verifyCredentialAttempt({
    store,
    parsed,
    address,
    lookup: async () => [{ id: "u", password: "HASH" }],
    verify: async (candidate, hash) => hash === "HASH" && candidate === "right",
    dummyHash: "DUMMY",
    now,
  });
}

test("the pending migration is idempotent and creates a table with RLS on", async () => {
  await applyMigration();
  const table = await pg.query<{ relrowsecurity: boolean }>(
    `select relrowsecurity from pg_class where relname = 'AuthThrottle'`
  );
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].relrowsecurity, true);
});

test("postgres store: counts inside a window, restarts after it, peeks without counting", async () => {
  const store = new PostgresThrottleStore(exec);
  const t0 = Date.UTC(2026, 10, 16, 0, 0, 0);
  assert.equal((await store.hit("k", 60_000, t0)).count, 1);
  assert.equal((await store.hit("k", 60_000, t0 + 1_000)).count, 2);
  const third = await store.hit("k", 60_000, t0 + 59_000);
  assert.equal(third.count, 3);
  assert.equal(third.resetAt, t0 + 60_000, "later hits do not extend the window");

  assert.equal((await store.peek("k", t0 + 59_500))?.count, 3);
  assert.equal((await store.peek("k", t0 + 59_500))?.count, 3, "peek does not count");
  assert.equal(await store.peek("k", t0 + 60_000), null, "an expired window reads as none");

  const restarted = await store.hit("k", 60_000, t0 + 61_000);
  assert.deepEqual(restarted, { count: 1, resetAt: t0 + 121_000 });

  await store.clear("k");
  assert.equal(await store.peek("k", t0 + 62_000), null);
});

test("postgres store: forty simultaneous hits are all counted", async () => {
  const store = new PostgresThrottleStore(exec);
  const now = Date.UTC(2026, 10, 16, 1, 0, 0);
  const hits = await Promise.all(Array.from({ length: 40 }, () => store.hit("burst", 60_000, now)));
  assert.deepEqual(
    hits.map((hit) => hit.count).sort((a, b) => a - b),
    Array.from({ length: 40 }, (_, i) => i + 1),
    "every hit got its own count: no lost update"
  );
});

test("two instances over one database enforce one limit", async () => {
  // Two store objects stand in for two server instances: no shared memory,
  // one database.
  const instanceA = new PostgresThrottleStore(exec);
  const instanceB = new PostgresThrottleStore(exec);
  const now = Date.UTC(2026, 10, 16, 2, 0, 0);

  const outcomes: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const instance = i % 2 === 0 ? instanceA : instanceB;
    outcomes.push((await attempt(instance, "shared@example.test", "guess", "203.0.113.9", now + i)).outcome);
  }
  assert.deepEqual(
    outcomes,
    ["invalid", "invalid", "invalid", "invalid", "invalid", "locked", "locked", "locked"],
    "five attempts in total, not five per instance"
  );
  const lock = await readLoginLock(instanceB, "shared@example.test", "203.0.113.9", now + 10);
  assert.equal(lock.locked, true, "the instance that saw fewer attempts reports the lock as well");
});

test("for contrast: two in-memory instances each allow the full five", async () => {
  const instanceA = new MemoryThrottleStore();
  const instanceB = new MemoryThrottleStore();
  let evaluated = 0;
  for (let i = 0; i < 10; i += 1) {
    const instance = i % 2 === 0 ? instanceA : instanceB;
    if ((await attempt(instance, "split@example.test", "guess", "203.0.113.9", 1_000 + i)).outcome === "invalid") {
      evaluated += 1;
    }
  }
  assert.equal(
    evaluated,
    2 * LOGIN_LIMITS.pair,
    "this is the documented weakness of the default store: the limit multiplies by the instance count"
  );
});

test("purgeExpired removes only closed windows", async () => {
  const store = new PostgresThrottleStore(exec);
  const now = Date.UTC(2026, 10, 16, 3, 0, 0);
  await store.hit("old", 1_000, now);
  await store.hit("live", 60_000, now);
  await store.purgeExpired(now + 5_000);
  const rows = await pg.query<{ key: string }>(`select "key" from "AuthThrottle"`);
  assert.deepEqual(rows.rows.map((row) => row.key), ["live"]);
});

test("shared store down: the limit degrades to per-instance, it does not disappear", async () => {
  const lines: string[] = [];
  let down = true;
  const flaky: SqlExecutor = async (text, params) => {
    if (down) throw new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2");
    return exec(text, params);
  };
  const store = new ResilientThrottleStore(
    new PostgresThrottleStore(flaky),
    new MemoryThrottleStore(),
    (line) => lines.push(line)
  );
  const now = Date.UTC(2026, 10, 16, 4, 0, 0);

  const outcomes: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    outcomes.push((await attempt(store, "outage@example.test", "guess", "203.0.113.9", now + i)).outcome);
  }
  assert.deepEqual(outcomes.slice(0, 5), Array(5).fill("invalid"));
  assert.deepEqual(outcomes.slice(5), ["locked", "locked"], "still limited during the outage");

  // A legitimate user is not locked out by the outage itself.
  assert.equal((await attempt(store, "bystander@example.test", "right", "203.0.113.77", now)).outcome, "ok");

  assert.equal(lines.length, 1, "one line a minute, not one per request");
  const line = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(line.event, "auth_throttle_degraded");
  assert.ok(!lines[0].includes("hunter2") && !lines[0].includes("10.0.0.1"), "no driver text in the log line");
  assert.ok(!lines[0].includes("outage@"), "no account in the log line");

  down = false;
  const recovered = await store.hit("fresh-key", 60_000, now);
  assert.equal(recovered.count, 1);
  const rows = await pg.query(`select 1 from "AuthThrottle" where "key" = 'fresh-key'`);
  assert.equal(rows.rows.length, 1, "after recovery the shared store is used again");
});

test("the shared store is opt-in and needs both the flag and a database", () => {
  assert.equal(throttleModeFromEnv({}), "memory");
  assert.equal(throttleModeFromEnv({ DATABASE_URL: "postgres://x" }), "memory");
  assert.equal(throttleModeFromEnv({ AUTH_THROTTLE_STORE: "postgres" }), "memory");
  assert.equal(
    throttleModeFromEnv({ AUTH_THROTTLE_STORE: "postgres", DATABASE_URL: "postgres://x" }),
    "postgres"
  );
});

function credentialsRequest(email: string, path = "/api/auth/callback/credentials") {
  return new Request(`https://zooka.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-real-ip": "203.0.113.9",
    },
    body: new URLSearchParams({ email, password: "guess", csrfToken: "t" }).toString(),
  });
}

test("a locked caller of the credentials callback gets 429 with Retry-After", async () => {
  process.env.VERCEL = "1";
  const store = new MemoryThrottleStore();
  let handled = 0;
  let bodySeenByHandler = "";
  const route = withCredentialThrottle(async (request: Request) => {
    handled += 1;
    bodySeenByHandler = await request.text();
    return new Response("handled", { status: 200 });
  }, () => store);

  const open = await route(credentialsRequest("api@example.test"));
  assert.equal(open.status, 200);
  assert.equal(handled, 1);
  assert.ok(bodySeenByHandler.includes("csrfToken=t"), "the handler still receives the untouched body");

  for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
    await attempt(store, "api@example.test", "guess", "203.0.113.9", Date.now());
  }
  const locked = await route(credentialsRequest("api@example.test"));
  assert.equal(locked.status, 429);
  const retryAfter = Number(locked.headers.get("retry-after"));
  assert.ok(retryAfter > 0 && retryAfter <= 900, "Retry-After is the seconds left in the window");
  assert.equal(locked.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Object.keys(await locked.json()).sort(), ["error", "retryAfterSeconds"]);
  assert.equal(handled, 1, "the handler is not reached while locked");

  const other = await route(credentialsRequest("api@example.test", "/api/auth/callback/google"));
  assert.equal(other.status, 200, "other providers are never throttled here");
  delete process.env.VERCEL;
});

test("the pre-check can fail without breaking sign-in", async () => {
  const broken = {
    kind: "memory",
    hit: async () => {
      throw new Error("boom");
    },
    peek: async () => {
      throw new Error("boom");
    },
    clear: async () => undefined,
  } as unknown as ThrottleStore;
  let handled = 0;
  const route = withCredentialThrottle(async () => {
    handled += 1;
    return new Response("ok");
  }, () => broken);

  assert.equal((await route(credentialsRequest("x@example.test"))).status, 200);
  const garbage = new Request("https://zooka.test/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal((await route(garbage)).status, 200);
  assert.equal(handled, 2);
});
