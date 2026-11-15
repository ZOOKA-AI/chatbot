import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import {
  LOGIN_LIMITS,
  allowAuthAction,
  clientAddress,
  loginKeys,
  parseCredentials,
  readLoginLock,
  verifyCredentialAttempt,
} from "@/lib/auth/login-guard";
import { MemoryThrottleStore } from "@/lib/auth/throttle-store";

/**
 * Each case is an attack or a complaint, not a code path read back to itself:
 * guessing from one address, guessing spread over many addresses, one address
 * spraying many accounts, an office behind one address, a parallel burst, a
 * forged forwarding header, and a lock used to find out which accounts exist.
 */

const DUMMY = "$2b$10$dummyhashdummyhashdummyha";
const HASH = "$2b$10$realhashrealhashrealhashre";
const VERCEL = { platformSetsForwardedFor: true };

let store: MemoryThrottleStore;
beforeEach(() => {
  store = new MemoryThrottleStore();
});

function parsed(email = "owner@example.test", password = "wrong") {
  const value = parseCredentials({ email, password });
  assert.ok(value, "credentials must parse");
  return value;
}

/** Accounts whose password is "right"; records every lookup and comparison. */
function world(accounts: string[] = []) {
  const lookups: string[] = [];
  const comparisons: string[] = [];
  return {
    lookups,
    comparisons,
    attempt: (email: string, password: string, address: string, now = 1_000_000) =>
      verifyCredentialAttempt({
        store,
        parsed: parsed(email, password),
        address,
        lookup: async (candidate) => {
          lookups.push(candidate);
          return accounts.includes(candidate) ? [{ id: candidate, password: HASH }] : [];
        },
        verify: async (candidatePassword, hash) => {
          comparisons.push(hash);
          return hash === HASH && candidatePassword === "right";
        },
        dummyHash: DUMMY,
        now,
      }),
  };
}

test("one address guessing one account: the sixth attempt costs no lookup and no bcrypt", async () => {
  const w = world(["target@example.test"]);
  for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
    assert.equal((await w.attempt("target@example.test", "guess", "203.0.113.9")).outcome, "invalid");
  }
  const before = { lookups: w.lookups.length, comparisons: w.comparisons.length };

  const sixth = await w.attempt("target@example.test", "right", "203.0.113.9");
  assert.equal(sixth.outcome, "locked", "even the right password waits out the window");
  assert.ok(sixth.outcome === "locked" && sixth.retryAfterSeconds > 0 && sixth.retryAfterSeconds <= 900);
  assert.deepEqual(
    { lookups: w.lookups.length, comparisons: w.comparisons.length },
    before,
    "a locked attempt reaches neither the database nor bcrypt"
  );
});

test("the lock ends with the window, and hammering does not extend it", async () => {
  const w = world(["early@example.test"]);
  const start = 5_000_000;
  for (let i = 0; i < 200; i += 1) {
    await w.attempt("early@example.test", "nope", "192.0.2.7", start + i);
  }
  const after = await w.attempt("early@example.test", "right", "192.0.2.7", start + LOGIN_LIMITS.windowMs + 1);
  assert.equal(after.outcome, "ok", "200 attempts inside the window still unlock on time");
});

test("re-casing or padding the address buys no fresh bucket; another client is unaffected", async () => {
  const w = world(["owner@example.test"]);
  for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
    await w.attempt("Owner@Example.Test", "x", "203.0.113.20");
  }
  assert.equal((await w.attempt("  OWNER@example.TEST  ", "right", "203.0.113.20")).outcome, "locked");
  assert.equal((await w.attempt("owner@example.test", "right", "203.0.113.21")).outcome, "ok");
});

test("many addresses guessing one account: the account window closes the gap", async () => {
  const w = world(["victim@example.test"]);
  let reached = 0;
  for (let ip = 1; ip <= 10; ip += 1) {
    for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
      const result = await w.attempt("victim@example.test", "guess", `198.51.100.${ip}`);
      if (result.outcome === "invalid") reached += 1;
    }
  }
  assert.equal(reached, LOGIN_LIMITS.account, "50 attempts from 10 addresses, only 20 were evaluated");
  const fresh = await w.attempt("victim@example.test", "guess", "198.51.100.200");
  assert.equal(fresh.outcome, "locked", "an eleventh, unused address is refused too");
});

test("a single address cannot lock somebody else's account for everyone", async () => {
  const w = world(["victim@example.test"]);
  for (let i = 0; i < 1000; i += 1) {
    await w.attempt("victim@example.test", "guess", "198.51.100.66");
  }
  const owner = await w.attempt("victim@example.test", "right", "203.0.113.5");
  assert.equal(owner.outcome, "ok", "1000 requests from one address add only 5 to the account window");
});

test("one address spraying many accounts is stopped, with the right password too", async () => {
  const accounts = Array.from({ length: 130 }, (_, i) => `user${i}@example.test`);
  const w = world(accounts);
  for (let i = 0; i < LOGIN_LIMITS.address; i += 1) {
    assert.equal((await w.attempt(accounts[i], "Summer2026", "203.0.113.99")).outcome, "invalid");
  }
  assert.equal((await w.attempt(accounts[120], "right", "203.0.113.99")).outcome, "locked");
  assert.equal((await w.attempt(accounts[120], "right", "203.0.113.98")).outcome, "ok", "other clients are untouched");
});

test("an office behind one address: thirty people with two typos each all get in", async () => {
  const people = Array.from({ length: 30 }, (_, i) => `staff${i}@example.test`);
  const w = world(people);
  for (const person of people) {
    await w.attempt(person, "typo", "192.0.2.50");
    await w.attempt(person, "typo", "192.0.2.50");
  }
  for (const person of people) {
    assert.equal((await w.attempt(person, "right", "192.0.2.50")).outcome, "ok", `${person} must not be locked`);
  }
  // Successful sign-ins never count towards the address window.
  const lock = await readLoginLock(store, "newcomer@example.test", "192.0.2.50", 1_000_000);
  assert.equal(lock.locked, false);
});

test("a parallel burst cannot outrun the counter", async () => {
  const w = world(["burst@example.test"]);
  const results = await Promise.all(
    Array.from({ length: 50 }, () => w.attempt("burst@example.test", "guess", "203.0.113.70"))
  );
  assert.equal(results.filter((r) => r.outcome === "invalid").length, LOGIN_LIMITS.pair);
  assert.equal(results.filter((r) => r.outcome === "locked").length, 50 - LOGIN_LIMITS.pair);
  assert.equal(w.comparisons.length, LOGIN_LIMITS.pair, "only five comparisons were ever paid for");
});

test("the lock cannot be used to learn which accounts exist", async () => {
  const w = world(["real@example.test"]);
  const trace = async (email: string, address: string) => {
    const outcomes: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      outcomes.push((await w.attempt(email, "guess", address)).outcome);
    }
    return outcomes;
  };
  const real = await trace("real@example.test", "203.0.113.31");
  const ghost = await trace("nobody@example.test", "203.0.113.32");
  assert.deepEqual(real, ghost, "a real and an unknown account answer identically, lock included");
  assert.equal(
    w.comparisons.filter((hash) => hash === DUMMY).length,
    LOGIN_LIMITS.pair,
    "the unknown account paid one dummy comparison per evaluated attempt"
  );
});

test("an account without a password cannot be entered by submitting one", async () => {
  const result = await verifyCredentialAttempt({
    store,
    parsed: parsed("oauth-only@example.test", "anything"),
    address: "203.0.113.33",
    lookup: async () => [{ id: "u", password: null }],
    verify: async () => true,
    dummyHash: DUMMY,
  });
  assert.equal(result.outcome, "invalid");
});

test("a correct password clears the pair window, so an earlier typo is forgiven", async () => {
  const w = world(["owner@example.test"]);
  for (let i = 0; i < LOGIN_LIMITS.pair - 1; i += 1) {
    await w.attempt("owner@example.test", "nope", "203.0.113.40");
  }
  assert.equal((await w.attempt("owner@example.test", "right", "203.0.113.40")).outcome, "ok");
  for (let i = 0; i < LOGIN_LIMITS.pair - 1; i += 1) {
    assert.equal((await w.attempt("owner@example.test", "nope", "203.0.113.40")).outcome, "invalid");
  }
});

test("the owner signing in does not hand the attackers a fresh account window", async () => {
  const w = world(["victim@example.test"]);
  for (let ip = 1; ip <= 3; ip += 1) {
    for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
      await w.attempt("victim@example.test", "guess", `198.51.100.${ip}`);
    }
  }
  assert.equal((await w.attempt("victim@example.test", "right", "203.0.113.5")).outcome, "ok");

  let evaluated = 0;
  for (let ip = 10; ip <= 14; ip += 1) {
    for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
      if ((await w.attempt("victim@example.test", "guess", `198.51.100.${ip}`)).outcome === "invalid") {
        evaluated += 1;
      }
    }
  }
  assert.equal(evaluated, LOGIN_LIMITS.account - 16, "only what was left of the window, not a new one");
});

test("a historical mixed-case row can still sign in", async () => {
  const asked: string[] = [];
  const result = await verifyCredentialAttempt({
    store,
    parsed: parsed("Mixed@Example.test", "right"),
    address: "203.0.113.41",
    lookup: async (email) => {
      asked.push(email);
      return email === "Mixed@Example.test" ? [{ id: "u1", password: HASH }] : [];
    },
    verify: async (password, hash) => hash === HASH && password === "right",
    dummyHash: DUMMY,
  });
  assert.equal(result.outcome, "ok");
  assert.deepEqual(asked, ["mixed@example.test", "Mixed@Example.test"]);
});

test("a malformed body is refused before any counter, lookup or comparison", () => {
  for (const body of [
    null,
    undefined,
    "email=a@b.c",
    { email: 42, password: "x" },
    { email: { toString: () => "a@b.c" }, password: "x" },
    { email: "no-at-sign", password: "x" },
    { email: "a@b.c" },
    { email: "a@b.c", password: "" },
    { email: "", password: "x" },
    { email: `${"a".repeat(400)}@b.c`, password: "x" },
    { email: "a@b.c", password: "x".repeat(2000) },
  ]) {
    assert.equal(parseCredentials(body), null);
  }
  assert.equal(store.size, 0);
});

test("a forwarding header is believed only when the platform or the owner vouches for it", () => {
  const forged = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" });
  assert.equal(
    clientAddress(forged, { platformSetsForwardedFor: false }),
    "unknown",
    "off the platform the header is whatever the caller typed"
  );
  assert.equal(clientAddress(new Headers({ "x-real-ip": "203.0.113.6" }), VERCEL), "203.0.113.6");
  assert.equal(
    clientAddress(new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" }), VERCEL),
    "203.0.113.5"
  );
  assert.equal(
    clientAddress(new Headers({ "cf-connecting-ip": "203.0.113.8", "x-real-ip": "172.70.0.1" }), {
      platformSetsForwardedFor: true,
      trustedHeader: "cf-connecting-ip",
    }),
    "203.0.113.8",
    "a named trusted header wins over the proxy's own address"
  );
  assert.equal(clientAddress(new Headers({ "x-real-ip": "<script>" }), VERCEL), "unknown");
  assert.equal(clientAddress(new Headers({ "x-real-ip": "a".repeat(200) }), VERCEL), "unknown");
  assert.equal(clientAddress(undefined, VERCEL), "unknown");
});

test("with no trustworthy address the account is still protected and nobody shares a bucket by accident", async () => {
  const w = world(["a@example.test", "b@example.test"]);
  for (let i = 0; i < LOGIN_LIMITS.pair; i += 1) {
    await w.attempt("a@example.test", "guess", "unknown");
  }
  assert.equal((await w.attempt("a@example.test", "right", "unknown")).outcome, "locked");
  assert.equal((await w.attempt("b@example.test", "right", "unknown")).outcome, "ok");
  assert.equal(loginKeys("a@example.test", "unknown").address, null, "no address window without an address");
});

test("counter keys carry no email and no address", () => {
  const keys = loginKeys("owner@example.test", "203.0.113.5");
  for (const key of [keys.pair, keys.account, keys.address]) {
    assert.ok(key);
    assert.ok(!key.includes("owner") && !key.includes("example") && !key.includes("203.0"));
    assert.ok(key.length <= 80, "fits the shared table's key column");
  }
});

test("reading the lock counts nothing", async () => {
  for (let i = 0; i < 50; i += 1) {
    await readLoginLock(store, "peek@example.test", "203.0.113.60");
  }
  assert.equal(store.size, 0);
  const w = world(["peek@example.test"]);
  assert.equal((await w.attempt("peek@example.test", "right", "203.0.113.60")).outcome, "ok");
});

test("reset requests: three per hour for one mailbox, then silence", async () => {
  const hour = 60 * 60 * 1000;
  const answers: boolean[] = [];
  for (let i = 0; i < 5; i += 1) {
    answers.push(await allowAuthAction(store, "reset-email", "victim@example.test", 3, hour, 7_000_000 + i));
  }
  assert.deepEqual(answers, [true, true, true, false, false]);
  assert.equal(
    await allowAuthAction(store, "reset-email", "victim@example.test", 3, hour, 7_000_000 + hour + 1),
    true,
    "the allowance returns after the hour"
  );
});
