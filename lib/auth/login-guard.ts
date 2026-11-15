import { createHmac, randomBytes } from "node:crypto";
import type { ThrottleStore } from "@/lib/auth/throttle-store";

/**
 * Credential-attempt guard for the password sign-in path.
 *
 * Three windows, because one is not enough:
 *
 *   pair     same account from the same address    5 attempts  / 15 min
 *   account  same account from any address        20 attempts  / 15 min
 *   address  any account from the same address   100 failures  / 15 min
 *
 *  - `pair` stops ordinary guessing.
 *  - `account` stops guessing spread over many addresses. One address can add at
 *    most 5 to it per window, so locking somebody else's account takes several
 *    addresses, and the lock ends with the window.
 *  - `address` stops one address spraying many accounts. It counts failures
 *    only and is set high, so an office or a mobile carrier behind one address
 *    is not locked by ordinary typos, and successful sign-ins never count.
 *
 * `pair` and `account` are reserved atomically BEFORE the password is compared,
 * so a burst of parallel requests cannot all pass a check and then all fail.
 *
 * What this module does not decide: where the counters live. That is the
 * ThrottleStore. With the in-memory store the limits hold per instance only; see
 * lib/auth/throttle.ts for which store is active and why.
 */

export const LOGIN_LIMITS = {
  windowMs: 15 * 60 * 1000,
  pair: 5,
  account: 20,
  address: 100,
} as const;

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;
const UNKNOWN_ADDRESS = "unknown";

export type ParsedCredentials = { email: string; password: string; raw: string };

/**
 * Rejects anything that is not a plausible credential pair without touching the
 * database, the counters or bcrypt.
 */
export function parseCredentials(input: unknown): ParsedCredentials | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const { email, password } = input as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) {
    return null;
  }
  if (!normalized.includes("@") || password.length === 0) {
    return null;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return null;
  }
  return { email: normalized, password, raw: email };
}

/** Case and surrounding whitespace must not create a second bucket. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ADDRESS_SHAPE = /^[0-9a-fA-F.:]{3,45}$/;

function cleanAddress(value: string | null | undefined): string | null {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && ADDRESS_SHAPE.test(candidate) ? candidate : null;
}

export type ProxyTrust = {
  /** True when the platform itself sets the forwarding headers (Vercel). */
  platformSetsForwardedFor: boolean;
  /** A header set by a proxy the owner put in front, e.g. cf-connecting-ip. */
  trustedHeader?: string;
};

export function proxyTrustFromEnv(
  env: Record<string, string | undefined> = process.env
): ProxyTrust {
  return {
    platformSetsForwardedFor: env.VERCEL === "1",
    trustedHeader: env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase() || undefined,
  };
}

/**
 * The client address, from a header that the client cannot forge.
 *
 * x-forwarded-for is only trustworthy when the platform overwrites it. Vercel
 * does (documented: it replaces the header with the client's public address and
 * does not forward external values), so on Vercel x-real-ip / x-forwarded-for
 * are used. Anywhere else the header is whatever the caller typed, so it is
 * ignored unless the owner names a trusted header. An untrusted or malformed
 * value yields "unknown", which switches the address windows off rather than
 * letting an attacker pick a fresh bucket per request.
 */
export function clientAddress(
  headers: Headers | undefined,
  trust: ProxyTrust = proxyTrustFromEnv()
): string {
  if (!headers) return UNKNOWN_ADDRESS;
  if (trust.trustedHeader) {
    return cleanAddress(headers.get(trust.trustedHeader)) ?? UNKNOWN_ADDRESS;
  }
  if (!trust.platformSetsForwardedFor) {
    return UNKNOWN_ADDRESS;
  }
  return (
    cleanAddress(headers.get("x-real-ip")) ??
    cleanAddress(headers.get("x-forwarded-for")) ??
    UNKNOWN_ADDRESS
  );
}

// Keys are HMACs, so a shared counter table holds no email and no address.
const processSecret = randomBytes(32).toString("hex");

function digest(scope: string, value: string): string {
  const secret = process.env.AUTH_SECRET || processSecret;
  return `${scope}:${createHmac("sha256", secret).update(`${scope}|${value}`).digest("hex").slice(0, 40)}`;
}

export function loginKeys(email: string, address: string) {
  const account = normalizeEmail(email);
  const known = address !== UNKNOWN_ADDRESS;
  return {
    pair: digest("p", `${account}|${address}`),
    account: digest("a", account),
    address: known ? digest("i", address) : null,
  };
}

function secondsUntil(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

export type LockState =
  | { locked: false }
  | { locked: true; retryAfterSeconds: number; scope: "pair" | "account" | "address" };

/** Read-only: counts nothing. Used to answer "try again in N seconds". */
export async function readLoginLock(
  store: ThrottleStore,
  email: string,
  address: string,
  now: number = Date.now()
): Promise<LockState> {
  const keys = loginKeys(email, address);
  const checks: [typeof keys.pair | null, number, "pair" | "account" | "address"][] = [
    [keys.pair, LOGIN_LIMITS.pair, "pair"],
    [keys.account, LOGIN_LIMITS.account, "account"],
    [keys.address, LOGIN_LIMITS.address, "address"],
  ];
  for (const [key, limit, scope] of checks) {
    if (!key) continue;
    const hit = await store.peek(key, now);
    if (hit && hit.count >= limit) {
      return { locked: true, retryAfterSeconds: secondsUntil(hit.resetAt, now), scope };
    }
  }
  return { locked: false };
}

type StoredUser = { id?: string; email?: string | null; password?: string | null };

export type CredentialAttempt =
  | { outcome: "ok"; user: StoredUser }
  | { outcome: "invalid" }
  | { outcome: "locked"; retryAfterSeconds: number };

/**
 * The whole decision in one place, testable without NextAuth.
 *
 * Order: reserve pair -> reserve account -> read address -> lookup -> compare.
 * A locked caller triggers no database lookup and no bcrypt work. An unknown
 * address still pays one dummy comparison, and a lock is applied to unknown
 * accounts exactly as to real ones, so neither timing nor the lock reveals
 * whether an account exists.
 */
export async function verifyCredentialAttempt(input: {
  store: ThrottleStore;
  parsed: ParsedCredentials;
  address: string;
  lookup: (email: string) => Promise<StoredUser[]>;
  verify: (password: string, hash: string) => Promise<boolean>;
  dummyHash: string;
  now?: number;
}): Promise<CredentialAttempt> {
  const { store, parsed, address, lookup, verify, dummyHash } = input;
  const now = input.now ?? Date.now();
  const keys = loginKeys(parsed.email, address);
  const { windowMs } = LOGIN_LIMITS;

  const pair = await store.hit(keys.pair, windowMs, now);
  if (pair.count > LOGIN_LIMITS.pair) {
    return { outcome: "locked", retryAfterSeconds: secondsUntil(pair.resetAt, now) };
  }

  const account = await store.hit(keys.account, windowMs, now);
  if (account.count > LOGIN_LIMITS.account) {
    return { outcome: "locked", retryAfterSeconds: secondsUntil(account.resetAt, now) };
  }

  if (keys.address) {
    const seen = await store.peek(keys.address, now);
    if (seen && seen.count >= LOGIN_LIMITS.address) {
      return { outcome: "locked", retryAfterSeconds: secondsUntil(seen.resetAt, now) };
    }
  }

  const candidates =
    parsed.raw.trim().toLowerCase() === parsed.raw
      ? [parsed.email]
      : [parsed.email, parsed.raw];

  let user: StoredUser | undefined;
  for (const candidate of candidates) {
    const found = await lookup(candidate);
    if (found.length > 0) {
      user = found[0];
      break;
    }
  }

  const matches = user?.password
    ? await verify(parsed.password, user.password)
    : (await verify(parsed.password, dummyHash), false);

  if (!user || !matches) {
    if (keys.address) {
      await store.hit(keys.address, windowMs, now);
    }
    return { outcome: "invalid" };
  }

  // Only the pair window is cleared. Clearing the account or address window on
  // success would let an attacker reset them by signing in to an account of
  // their own from the same address.
  await store.clear(keys.pair);
  return { outcome: "ok", user };
}

/**
 * Generic "N events per window" check for other auth actions (password-reset
 * requests). Returns false once the allowance is used up.
 */
export async function allowAuthAction(
  store: ThrottleStore,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): Promise<boolean> {
  const hit = await store.hit(digest(scope, subject), windowMs, now);
  return hit.count <= limit;
}
