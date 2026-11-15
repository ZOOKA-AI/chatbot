/**
 * Counter stores for authentication throttling.
 *
 * Two real implementations and one wrapper:
 *
 *  - MemoryThrottleStore: per process. Correct on one instance, and only a
 *    partial control on a multi-instance host (each instance counts alone).
 *  - PostgresThrottleStore: one atomic upsert per hit, so every instance sees
 *    the same count. Needs the "AuthThrottle" table
 *    (lib/db/migrations/pending/auth_throttle.sql), which is NOT applied
 *    anywhere yet.
 *  - ResilientThrottleStore: uses the shared store and, when it throws, falls
 *    back to the in-memory one for that call. A store outage therefore degrades
 *    the limit to per-instance; it never removes the limit and never locks every
 *    user out.
 *
 * Fixed windows: the window opens on the first hit and closes windowMs later.
 * Hits inside a full window do not extend it, so a client that keeps hammering
 * cannot hold an account locked forever.
 */

export type ThrottleHit = { count: number; resetAt: number };

export interface ThrottleStore {
  readonly kind: "memory" | "postgres" | "resilient";
  /** Atomically count one event and return the count inside the open window. */
  hit(key: string, windowMs: number, now: number): Promise<ThrottleHit>;
  /** Read the open window without counting. Null when there is none. */
  peek(key: string, now: number): Promise<ThrottleHit | null>;
  clear(key: string): Promise<void>;
}

const MAX_TRACKED_KEYS = 10_000;

export class MemoryThrottleStore implements ThrottleStore {
  readonly kind = "memory" as const;
  private readonly entries = new Map<string, ThrottleHit>();

  constructor(private readonly maxKeys: number = MAX_TRACKED_KEYS) {}

  async hit(key: string, windowMs: number, now: number): Promise<ThrottleHit> {
    const current = this.entries.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return { ...current };
    }
    const fresh = { count: 1, resetAt: now + windowMs };
    if (!this.entries.has(key) && this.entries.size >= this.maxKeys) {
      // A Map iterates in insertion order, so the first key is the oldest.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.delete(key);
    this.entries.set(key, fresh);
    return { ...fresh };
  }

  async peek(key: string, now: number): Promise<ThrottleHit | null> {
    const current = this.entries.get(key);
    if (!current) return null;
    if (current.resetAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return { ...current };
  }

  async clear(key: string): Promise<void> {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Minimal SQL executor, so the store runs on any driver and on a test engine. */
export type SqlExecutor = (
  text: string,
  params: unknown[]
) => Promise<Record<string, unknown>[]>;

const HIT_SQL = `
INSERT INTO "AuthThrottle" ("key", "count", "resetAt")
VALUES ($1, 1, $2::timestamptz)
ON CONFLICT ("key") DO UPDATE SET
  "count" = CASE
    WHEN "AuthThrottle"."resetAt" <= $3::timestamptz THEN 1
    ELSE "AuthThrottle"."count" + 1
  END,
  "resetAt" = CASE
    WHEN "AuthThrottle"."resetAt" <= $3::timestamptz THEN $2::timestamptz
    ELSE "AuthThrottle"."resetAt"
  END
RETURNING "count", "resetAt"`;

const PEEK_SQL = `
SELECT "count", "resetAt" FROM "AuthThrottle"
WHERE "key" = $1 AND "resetAt" > $2::timestamptz`;

function toHit(row: Record<string, unknown> | undefined): ThrottleHit | null {
  if (!row) return null;
  const resetAt =
    row.resetAt instanceof Date
      ? row.resetAt.getTime()
      : Date.parse(String(row.resetAt));
  const count = Number(row.count);
  if (!Number.isFinite(resetAt) || !Number.isFinite(count)) return null;
  return { count, resetAt };
}

export class PostgresThrottleStore implements ThrottleStore {
  readonly kind = "postgres" as const;

  constructor(private readonly exec: SqlExecutor) {}

  async hit(key: string, windowMs: number, now: number): Promise<ThrottleHit> {
    const rows = await this.exec(HIT_SQL, [
      key,
      new Date(now + windowMs).toISOString(),
      new Date(now).toISOString(),
    ]);
    const hit = toHit(rows[0]);
    if (!hit) throw new Error("auth_throttle_bad_row");
    return hit;
  }

  async peek(key: string, now: number): Promise<ThrottleHit | null> {
    const rows = await this.exec(PEEK_SQL, [key, new Date(now).toISOString()]);
    return toHit(rows[0]);
  }

  async clear(key: string): Promise<void> {
    await this.exec(`DELETE FROM "AuthThrottle" WHERE "key" = $1`, [key]);
  }

  /** Housekeeping; safe to call from any instance at any time. */
  async purgeExpired(now: number): Promise<void> {
    await this.exec(
      `DELETE FROM "AuthThrottle" WHERE "resetAt" <= $1::timestamptz`,
      [new Date(now).toISOString()]
    );
  }
}

export class ResilientThrottleStore implements ThrottleStore {
  readonly kind = "resilient" as const;
  private lastReport = 0;
  failures = 0;

  constructor(
    private readonly primary: ThrottleStore,
    private readonly fallback: ThrottleStore,
    private readonly report: (line: string) => void = (line) =>
      console.warn(line)
  ) {}

  private degraded(operation: string, error: unknown) {
    this.failures += 1;
    const now = Date.now();
    // One line a minute at most: an outage must not flood the log, and the line
    // carries no key (keys are derived from emails and addresses).
    if (now - this.lastReport >= 60_000) {
      this.lastReport = now;
      this.report(
        JSON.stringify({
          ts: new Date(now).toISOString(),
          event: "auth_throttle_degraded",
          operation,
          fallback: this.fallback.kind,
          reason: error instanceof Error ? error.name : "unknown",
        })
      );
    }
  }

  async hit(key: string, windowMs: number, now: number): Promise<ThrottleHit> {
    try {
      return await this.primary.hit(key, windowMs, now);
    } catch (error) {
      this.degraded("hit", error);
      return this.fallback.hit(key, windowMs, now);
    }
  }

  async peek(key: string, now: number): Promise<ThrottleHit | null> {
    try {
      return await this.primary.peek(key, now);
    } catch (error) {
      this.degraded("peek", error);
      return this.fallback.peek(key, now);
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await this.primary.clear(key);
    } catch (error) {
      this.degraded("clear", error);
    }
    await this.fallback.clear(key);
  }
}
