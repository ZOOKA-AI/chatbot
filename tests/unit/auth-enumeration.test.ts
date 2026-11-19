import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Account enumeration, verification tokens and reset concurrency.
 *
 * What is proven here:
 *   - registration answers identically for a new and a registered address, and
 *     does comparable work in both branches (timing is an oracle too);
 *   - tokens are stored only as digests, expire, and work once;
 *   - two concurrent submissions of the same token produce exactly one winner;
 *   - a duplicate-email race collapses into the neutral branch instead of
 *     creating a second account;
 *   - throttling bounds attempts without confirming anything.
 *
 * The token and reset-claim tests run the real SQL on real PostgreSQL (PGlite).
 * What is NOT proven: that verification mail is delivered. No message was sent.
 */

vi.mock("server-only", () => ({}));

import {
  NEUTRAL_SIGNUP_STATUS,
  isTokenShape,
  newToken,
  normalizeEmail,
  planRegistration,
  tokenIsUsable,
} from "@/lib/auth/registration";
import { createThrottle } from "@/lib/auth/throttle";
import {
  claimPasswordResetToken,
  consumeVerificationToken,
  issueVerificationToken,
} from "@/lib/auth/verification";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

const ORG = "org-alpha";

async function apply(sql: string) {
  for (const part of sql.split("--> statement-breakpoint")) {
    const statement = part.trim();
    if (statement) await pg.exec(statement);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/0027_agent_command_center.sql"), "utf8"));
  // Minimal User + PasswordResetToken shapes the migration chain expects.
  await pg.exec(`create table if not exists "User" (
    id uuid primary key default gen_random_uuid(),
    email varchar(64) not null,
    password varchar(64)
  )`);
  await pg.exec(`create table if not exists "PasswordResetToken" (
    "tokenHash" varchar(64) primary key not null,
    "userId" uuid not null references "User"(id) on delete cascade,
    "expiresAt" timestamp not null,
    "usedAt" timestamp,
    "createdAt" timestamp default now() not null
  )`);
  await apply(readFileSync(join(process.cwd(), "lib/db/migrations/pending/0029_auth_email_verification.sql"), "utf8"));
  db = drizzle(pg, { schema });
});

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec(`delete from "EmailVerificationToken"`);
  await pg.exec(`delete from "PasswordResetToken"`);
  await pg.exec(`delete from "User"`);
});

async function makeUser(email = "owner@example.com") {
  const { rows } = await pg.query<{ id: string }>(
    `insert into "User" (email, password) values ($1, 'x') returning id`,
    [email]
  );
  return rows[0].id;
}

describe("registration is neutral", () => {
  test("both branches answer with the same status", () => {
    const fresh = planRegistration({ existing: false });
    const taken = planRegistration({ existing: true });
    const raced = planRegistration({ existing: false, createFailedOnConflict: true });

    assert.equal(fresh.status, NEUTRAL_SIGNUP_STATUS);
    assert.equal(taken.status, NEUTRAL_SIGNUP_STATUS);
    assert.equal(raced.status, NEUTRAL_SIGNUP_STATUS, "a lost race looks like any other submission");
    assert.equal(fresh.status, taken.status);
  });

  test("only the fresh branch creates an account, and only it says so", () => {
    const fresh = planRegistration({ existing: false });
    const taken = planRegistration({ existing: true });

    assert.equal(fresh.createAccount, true);
    assert.equal(taken.createAccount, false);
    assert.equal(fresh.sendVerification, true);
    assert.equal(taken.equalizeWork, true, "the taken branch must still spend hash time");
    assert.equal(fresh.equalizeWork, false);
  });

  test("the taken branch is the only one that differs, and only inside the mailbox", () => {
    const taken = planRegistration({ existing: true });
    const fresh = planRegistration({ existing: false });
    assert.equal(taken.sendExistingAccountNotice, true);
    assert.equal(fresh.sendExistingAccountNotice, false);
  });

  test("email normalisation collapses the shapes that would bypass a check", () => {
    assert.equal(normalizeEmail("  Owner@Example.COM "), "owner@example.com");
    assert.equal(normalizeEmail("a@b.co"), "a@b.co");
    assert.equal(normalizeEmail("no-at-sign"), null);
    assert.equal(normalizeEmail("a@b"), null);
    assert.equal(normalizeEmail(`${"x".repeat(300)}@b.co`), null);
    assert.equal(normalizeEmail(42), null);
    assert.equal(normalizeEmail(null), null);
  });
});

describe("tokens are single use and expire", () => {
  test("a token is high entropy, handed out once, and stored only as a digest", async () => {
    const userId = await makeUser();
    const issued = await issueVerificationToken(userId, { db });

    assert.match(issued.token, /^[a-f0-9]{64}$/);
    assert.notEqual(issued.token, issued.hash, "the raw token is never the stored value");

    const { rows } = await pg.query<{ tokenHash: string }>(
      `select "tokenHash" from "EmailVerificationToken"`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tokenHash, issued.hash);
    assert.ok(!rows[0].tokenHash.includes(issued.token));
  });

  test("a good token works exactly once", async () => {
    const userId = await makeUser();
    const { token } = await issueVerificationToken(userId, { db });

    const first = await consumeVerificationToken(token, { db });
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.userId, userId);

    const second = await consumeVerificationToken(token, { db });
    assert.equal(second.ok, false, "the same link cannot be replayed");
  });

  test("two simultaneous submissions produce exactly one winner", async () => {
    const userId = await makeUser();
    const { token } = await issueVerificationToken(userId, { db });

    const results = await Promise.all([
      consumeVerificationToken(token, { db }),
      consumeVerificationToken(token, { db }),
      consumeVerificationToken(token, { db }),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1, "single use must survive a race");
  });

  test("an expired token is refused, and a malformed one is refused before any query", async () => {
    const userId = await makeUser();
    const { token } = await issueVerificationToken(userId, { db, now: Date.now() - 25 * 60 * 60 * 1000 });

    const expired = await consumeVerificationToken(token, { db });
    assert.equal(expired.ok, false);

    const shaped = await consumeVerificationToken("not-a-token", { db });
    assert.equal(shaped.ok, false);
    assert.equal(shaped.ok === false && shaped.reason, "bad_shape");
  });

  test("a guessed but well-shaped token matches no row", async () => {
    const userId = await makeUser();
    await issueVerificationToken(userId, { db });
    const guessed = newToken().token;
    const result = await consumeVerificationToken(guessed, { db });
    assert.equal(result.ok, false);
  });

  test("tokenIsUsable states the rule without a database", () => {
    const future = new Date(Date.now() + 1000);
    const past = new Date(Date.now() - 1000);
    assert.equal(tokenIsUsable({ usedAt: null, expiresAt: future }), true);
    assert.equal(tokenIsUsable({ usedAt: new Date(), expiresAt: future }), false);
    assert.equal(tokenIsUsable({ usedAt: null, expiresAt: past }), false);
    assert.equal(tokenIsUsable(null), false);
  });

  test("isTokenShape accepts only the issued format", () => {
    assert.equal(isTokenShape(newToken().token), true);
    assert.equal(isTokenShape("A".repeat(64)), false, "uppercase hex is not our format");
    assert.equal(isTokenShape("a".repeat(63)), false);
    assert.equal(isTokenShape("a".repeat(65)), false);
    assert.equal(isTokenShape(null), false);
  });
});

describe("password reset cannot be spent twice", () => {
  async function resetToken(userId: string, expiresInMs = 30 * 60 * 1000) {
    const { token, hash } = newToken();
    await pg.query(
      `insert into "PasswordResetToken" ("tokenHash","userId","expiresAt") values ($1,$2,$3)`,
      [hash, userId, new Date(Date.now() + expiresInMs)]
    );
    return { token, hash };
  }

  test("one claim, one winner, even when submitted together", async () => {
    const userId = await makeUser();
    const { hash } = await resetToken(userId);

    const claims = await Promise.all([
      claimPasswordResetToken(hash, { db }),
      claimPasswordResetToken(hash, { db }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean), userId);
  });

  test("an expired or already used reset token yields nothing", async () => {
    const userId = await makeUser();
    const expired = await resetToken(userId, -1000);
    assert.equal(await claimPasswordResetToken(expired.hash, { db }), null);

    const fresh = await resetToken(userId);
    assert.equal(await claimPasswordResetToken(fresh.hash, { db }), userId);
    assert.equal(await claimPasswordResetToken(fresh.hash, { db }), null);
  });
});

describe("duplicate registration race", () => {
  test("the unique index makes a second account impossible for one address", async () => {
    await makeUser("dup@example.com");
    await assert.rejects(
      pg.query(`insert into "User" (email, password) values ($1,'y')`, ["dup@example.com"]),
      /duplicate key/
    );
  });

  test("case variations cannot create a second account", async () => {
    await makeUser("case@example.com");
    await assert.rejects(
      pg.query(`insert into "User" (email, password) values ($1,'y')`, ["CASE@example.com"]),
      /duplicate key/
    );
  });

  test("the migration refuses to run while duplicates exist", async () => {
    const solo = new PGlite();
    await solo.exec(`create table "User" (id uuid primary key, email varchar(64) not null, password varchar(64))`);
    await solo.exec(`insert into "User" (id, email) values (gen_random_uuid(),'a@b.co'),(gen_random_uuid(),'A@b.co')`);

    await assert.rejects(
      (async () => {
        for (const part of readFileSync(
          join(process.cwd(), "lib/db/migrations/pending/0029_auth_email_verification.sql"),
          "utf8"
        ).split("--> statement-breakpoint")) {
          if (part.trim()) await solo.exec(part.trim());
        }
      })(),
      /duplicated/,
      "the migration must name the problem instead of failing on the index"
    );
    await solo.close();
  });
});

describe("abuse protection", () => {
  test("the window slides, refills, and is per key", () => {
    let now = 1_000_000;
    const throttle = createThrottle({ limit: 3, windowMs: 1000, now: () => now });

    assert.equal(throttle.check("a").allowed, true);
    assert.equal(throttle.check("a").allowed, true);
    assert.equal(throttle.check("a").allowed, true);

    const blocked = throttle.check("a");
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.allowed === false && blocked.retryAfterMs > 0);

    assert.equal(throttle.check("b").allowed, true, "another address is unaffected");

    now += 1001;
    assert.equal(throttle.check("a").allowed, true, "the window refilled");
  });

  test("a reset clears the budget for that key only", () => {
    const throttle = createThrottle({ limit: 1, windowMs: 60_000 });
    assert.equal(throttle.check("x").allowed, true);
    assert.equal(throttle.check("x").allowed, false);
    throttle.reset("x");
    assert.equal(throttle.check("x").allowed, true);
  });

  test("the key table stays bounded", () => {
    const throttle = createThrottle({ limit: 1, windowMs: 60_000, maxKeys: 5 });
    for (let i = 0; i < 200; i += 1) throttle.check(`k${i}`);
    assert.ok(throttle.size() <= 5, `size was ${throttle.size()}`);
  });
});
