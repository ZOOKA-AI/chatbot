/**
 * Credential-attempt guard for the password sign-in path.
 *
 * Why this exists: `authorize()` compares a password on every request, and
 * nothing counted the failures. lib/ratelimit.ts cannot help — it is scoped to
 * chat/account routes and returns early when REDIS_URL is absent, which is the
 * case in this deployment. So the login endpoint accepted unlimited guesses.
 *
 * This guard is deliberately dependency-free (no Redis, no DB): a sliding window
 * of failures per email AND per client address, with a lockout. It fails closed
 * in the only sense that matters here — it never blocks a correct password, but
 * it stops the guessing once the window is full.
 *
 * Known limit, stated rather than hidden: the store is per process. On Vercel
 * several instances each keep their own counters, so the effective global limit
 * is roughly MAX_FAILURES x instance count. A shared store (Redis/Upstash) is the
 * correct next step and is cheap, but it needs a credential the owner has not
 * provided, and shipping an inert Redis path is exactly the mistake that made
 * lib/ratelimit.ts useless. Per-instance limit now, shared store when configured.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_TRACKED_KEYS = 10_000;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;

/** failure timestamps per key, oldest first */
const failures = new Map<string, number[]>();

export type ParsedCredentials = { email: string; password: string; raw: string };

/**
 * Rejects anything that is not a plausible credential pair without touching the
 * database or bcrypt. A non-string body used to reach `getUser()` and could throw
 * a 500; now it is a plain refusal.
 */
export function parseCredentials(input: unknown): ParsedCredentials | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const { email, password } = input as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }
  const raw = email;
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
  return { email: normalized, password, raw };
}

/** Case and surrounding whitespace must not create a second rate-limit bucket. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Forwarded headers are set by the platform; the first entry is the client. */
export function clientAddress(headers: Headers | undefined): string {
  const forwarded = headers?.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers?.get("x-real-ip")?.trim() || "unknown";
}

export function loginGuardKey(email: string, address: string): string {
  return `${normalizeEmail(email)}|${address}`;
}

function prune(list: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  return list.filter((stamp) => stamp > cutoff);
}

function boundedSet(key: string, list: number[]) {
  if (failures.size >= MAX_TRACKED_KEYS && !failures.has(key)) {
    // Oldest insertion goes first; a Map keeps insertion order.
    const oldest = failures.keys().next();
    if (!oldest.done) failures.delete(oldest.value);
  }
  failures.set(key, list);
}

export function recordFailure(key: string, now: number = Date.now()): number {
  const list = prune(failures.get(key) ?? [], now);
  list.push(now);
  boundedSet(key, list);
  return list.length;
}

export function isLocked(key: string, now: number = Date.now()): boolean {
  const list = prune(failures.get(key) ?? [], now);
  if (list.length === 0) {
    failures.delete(key);
    return false;
  }
  boundedSet(key, list);
  return list.length >= MAX_FAILURES;
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

/** Only for tests: the module state is process-wide on purpose. */
export function resetLoginGuard(): void {
  failures.clear();
}

export const LOGIN_GUARD_LIMITS = {
  windowMs: WINDOW_MS,
  maxFailures: MAX_FAILURES,
  maxTrackedKeys: MAX_TRACKED_KEYS,
} as const;

type StoredUser = { id?: string; email?: string | null; password?: string | null };

export type CredentialAttempt =
  | { outcome: "ok"; user: StoredUser }
  | { outcome: "invalid" }
  | { outcome: "locked" };

/**
 * The whole decision in one place, so it can be tested without NextAuth.
 *
 * Order matters and is the point: shape -> lock -> lookup -> compare. A locked
 * caller triggers no database query and no bcrypt work; an unknown address still
 * pays one dummy comparison so the response time does not reveal that the account
 * does not exist.
 */
export async function verifyCredentialAttempt(input: {
  parsed: ParsedCredentials;
  address: string;
  lookup: (email: string) => Promise<StoredUser[]>;
  verify: (password: string, hash: string) => Promise<boolean>;
  dummyHash: string;
  now?: number;
}): Promise<CredentialAttempt> {
  const { parsed, address, lookup, verify, dummyHash } = input;
  const now = input.now ?? Date.now();
  const key = loginGuardKey(parsed.email, address);

  if (isLocked(key, now)) {
    return { outcome: "locked" };
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

  if (!user?.password) {
    await verify(parsed.password, dummyHash);
    recordFailure(key, now);
    return { outcome: "invalid" };
  }

  const matches = await verify(parsed.password, user.password);
  if (!matches) {
    recordFailure(key, now);
    return { outcome: "invalid" };
  }

  clearFailures(key);
  return { outcome: "ok", user };
}
