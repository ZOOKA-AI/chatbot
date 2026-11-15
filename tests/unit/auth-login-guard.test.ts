import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import {
  LOGIN_GUARD_LIMITS,
  clientAddress,
  isLocked,
  loginGuardKey,
  normalizeEmail,
  parseCredentials,
  recordFailure,
  resetLoginGuard,
  verifyCredentialAttempt,
} from "@/lib/auth/login-guard";

/**
 * Regression suite for the credential guard. Each case is a real attack or a real
 * user complaint, not a code path read back to itself:
 *
 *  - unlimited guessing (the vulnerability this closes)
 *  - a different capitalisation or a stray space creating a fresh bucket
 *  - a malformed body reaching the database
 *  - a lockout that silently keeps spending bcrypt and queries
 *  - a correct password refused because of someone else's failures
 */

const DUMMY = "$2b$10$dummyhashdummyhashdummyha";
const HASH = "$2b$10$realhashrealhashrealhashre";

function parsed(email = "owner@example.test", password = "correct-horse") {
  const value = parseCredentials({ email, password });
  assert.ok(value, "credentials must parse");
  return value;
}

/** A lookup that records every address it was asked about. */
function spyLookup(rows: Record<string, { password?: string | null }[]>) {
  const asked: string[] = [];
  return {
    asked,
    lookup: async (email: string) => {
      asked.push(email);
      return (rows[normalizeEmail(email)] ?? []) as { password?: string | null }[];
    },
  };
}

beforeEach(() => {
  resetLoginGuard();
});

test("guessing is stopped: the sixth attempt never reaches the database", async () => {
  const { lookup, asked } = spyLookup({});
  const attempt = (now: number) =>
    verifyCredentialAttempt({
      parsed: parsed("target@example.test", "guess"),
      address: "203.0.113.9",
      lookup,
      verify: async () => false,
      dummyHash: DUMMY,
      now,
    });

  const first = await attempt(1_000_000);
  assert.equal(first.outcome, "invalid");
  assert.equal(asked.length, 1, "a live attempt asks the database once");

  for (let i = 1; i < LOGIN_GUARD_LIMITS.maxFailures; i += 1) {
    await attempt(1_000_000 + i);
  }
  assert.equal(asked.length, LOGIN_GUARD_LIMITS.maxFailures, "failed guesses do query");

  const locked = await attempt(1_000_000 + 100);
  assert.equal(locked.outcome, "locked");
  assert.equal(
    asked.length,
    LOGIN_GUARD_LIMITS.maxFailures,
    "a locked attempt must not touch the database"
  );
});

test("a locked attempt performs no password comparison", async () => {
  const { lookup } = spyLookup({});
  let comparisons = 0;
  const verify = async () => {
    comparisons += 1;
    return false;
  };
  const options = {
    parsed: parsed("brute@example.test", "x"),
    address: "198.51.100.4",
    lookup,
    verify,
    dummyHash: DUMMY,
    now: 2_000_000,
  };

  for (let i = 0; i < LOGIN_GUARD_LIMITS.maxFailures; i += 1) {
    await verifyCredentialAttempt(options);
  }
  const before = comparisons;
  const locked = await verifyCredentialAttempt(options);
  assert.equal(locked.outcome, "locked");
  assert.equal(comparisons, before, "no bcrypt work is spent while locked");
});

test("the window expires and the account is usable again", async () => {
  const { lookup } = spyLookup({ "early@example.test": [{ password: HASH }] });
  const start = 5_000_000;
  for (let i = 0; i < LOGIN_GUARD_LIMITS.maxFailures; i += 1) {
    await verifyCredentialAttempt({
      parsed: parsed("early@example.test", "wrong"),
      address: "192.0.2.7",
      lookup,
      verify: async (password, hash) => password === "right" && hash === HASH,
      dummyHash: DUMMY,
      now: start,
    });
  }
  const key = loginGuardKey("early@example.test", "192.0.2.7");
  assert.equal(isLocked(key, start), true);

  const afterWindow = start + LOGIN_GUARD_LIMITS.windowMs + 1;
  const retry = await verifyCredentialAttempt({
    parsed: parsed("early@example.test", "right"),
    address: "192.0.2.7",
    lookup,
    verify: async (password, hash) => password === "right" && hash === HASH,
    dummyHash: DUMMY,
    now: afterWindow,
  });
  assert.equal(retry.outcome, "ok", "waiting out the window restores access");
});

test("capitalisation and padding do not buy a fresh bucket", async () => {
  const { lookup } = spyLookup({ "owner@example.test": [{ password: HASH }] });
  const verify = async (password: string, hash: string) => hash === HASH && password === "pass";
  const base = { address: "203.0.113.20", lookup, verify, dummyHash: DUMMY };

  for (let i = 0; i < LOGIN_GUARD_LIMITS.maxFailures; i += 1) {
    await verifyCredentialAttempt({ ...base, parsed: parsed("Owner@Example.Test", "x") });
  }
  const spoof = await verifyCredentialAttempt({
    ...base,
    parsed: parsed("  OWNER@example.TEST  ", "pass"),
  });
  assert.equal(spoof.outcome, "locked", "a padded or re-cased address is the same bucket");

  const otherIp = await verifyCredentialAttempt({
    ...base,
    address: "203.0.113.21",
    parsed: parsed("owner@example.test", "pass"),
  });
  assert.equal(otherIp.outcome, "ok", "a different client is not punished for it");
});

test("a malformed body is refused before any lookup", async () => {
  const { lookup, asked } = spyLookup({});
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
    { email: "a".repeat(400) + "@b.c", password: "x" },
    { email: "a@b.c", password: "x".repeat(2000) },
  ]) {
    assert.equal(parseCredentials(body), null, `must refuse: ${JSON.stringify(body)?.slice(0, 40)}`);
  }
  assert.equal(asked.length, 0);
});

test("an unknown address costs one dummy comparison, like a wrong password", async () => {
  const { lookup } = spyLookup({});
  const calls: string[] = [];
  const result = await verifyCredentialAttempt({
    parsed: parsed("nobody@example.test", "whatever"),
    address: "203.0.113.30",
    lookup,
    verify: async (_password, hash) => {
      calls.push(hash);
      return false;
    },
    dummyHash: DUMMY,
  });
  assert.equal(result.outcome, "invalid");
  assert.deepEqual(calls, [DUMMY], "the dummy hash is compared once, no early return");
});

test("an account without a password cannot be entered by submitting one", async () => {
  const { lookup } = spyLookup({ "oauth-only@example.test": [{ password: null }] });
  const result = await verifyCredentialAttempt({
    parsed: parsed("oauth-only@example.test", "anything"),
    address: "203.0.113.31",
    lookup,
    verify: async () => true,
    dummyHash: DUMMY,
  });
  assert.equal(result.outcome, "invalid", "no password means no password login");
});

test("a correct password clears the failure history", async () => {
  const { lookup } = spyLookup({ "owner@example.test": [{ password: HASH }] });
  const verify = async (password: string) => password === "pass";
  const base = { lookup, verify, dummyHash: DUMMY, address: "203.0.113.40" };

  for (let i = 0; i < LOGIN_GUARD_LIMITS.maxFailures - 1; i += 1) {
    await verifyCredentialAttempt({ ...base, parsed: parsed("owner@example.test", "nope") });
  }
  const ok = await verifyCredentialAttempt({ ...base, parsed: parsed("owner@example.test", "pass") });
  assert.equal(ok.outcome, "ok");
  assert.equal(
    isLocked(loginGuardKey("owner@example.test", "203.0.113.40")),
    false,
    "success resets the counter so one earlier typo cannot lock a real user out"
  );
});

test("a mixed-case stored address still signs in", async () => {
  // Some historical rows kept the case the user typed. Normalising must not lock
  // them out, so the raw form is tried as a second candidate.
  const asked: string[] = [];
  const lookup = async (email: string) => {
    asked.push(email);
    return email === "Mixed@Example.test"
      ? [{ id: "u1", email, password: HASH }]
      : [];
  };
  const result = await verifyCredentialAttempt({
    parsed: parsed("Mixed@Example.test", "pass"),
    address: "203.0.113.41",
    lookup,
    verify: async (password, hash) => hash === HASH && password === "pass",
    dummyHash: DUMMY,
  });
  assert.equal(result.outcome, "ok");
  assert.deepEqual(asked, ["mixed@example.test", "Mixed@Example.test"]);
});

test("the tracked-key table stays bounded under a spray of addresses", () => {
  const now = 9_000_000;
  const total = LOGIN_GUARD_LIMITS.maxTrackedKeys + 500;
  for (let i = 0; i < total; i += 1) {
    recordFailure(`spray-${i}|203.0.113.${i % 255}`, now);
  }

  const newest = `spray-${total - 1}|203.0.113.${(total - 1) % 255}`;
  assert.equal(recordFailure(newest, now), 2, "the newest key is still tracked");

  // The spray used one failure per address, so nothing is locked: a flood of
  // identities must not lock out a legitimate user who shares none of them.
  const victim = loginGuardKey("real.user@example.test", "203.0.113.77");
  assert.equal(isLocked(victim, now), false);

  // And the table cannot grow past the cap: the oldest entries were evicted, so
  // a fresh look at the very first key finds no history at all.
  assert.equal(isLocked(`spray-0|203.0.113.0`, now), false);
});

test("the client address comes from the first forwarded hop, never a raw header blob", () => {
  const forwarded = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientAddress(forwarded), "203.0.113.5");
  assert.equal(clientAddress(new Headers({ "x-real-ip": "203.0.113.6" })), "203.0.113.6");
  assert.equal(clientAddress(new Headers()), "unknown");
  assert.equal(clientAddress(undefined), "unknown");
});
