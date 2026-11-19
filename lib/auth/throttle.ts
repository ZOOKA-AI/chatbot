/**
 * A per-process sliding-window limiter.
 *
 * Limits are honest about their scope: the counter lives in this process, so the
 * effective ceiling is `limit` multiplied by the number of warm instances. It is
 * still worth having, because it turns an unlimited oracle into a bounded one,
 * and it costs nothing. A shared store (Redis/Upstash) is the real fix and needs
 * a credential the owner has not provided; PR #93 carries the same caveat for
 * the login path, and this module is written so both can share it later.
 */

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

type Bucket = { hits: number[]; };

export function createThrottle(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}) {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  function prune(entry: Bucket, at: number) {
    const cutoff = at - windowMs;
    while (entry.hits.length > 0 && entry.hits[0] <= cutoff) {
      entry.hits.shift();
    }
  }

  function check(key: string): ThrottleDecision {
    const at = now();
    let entry = buckets.get(key);

    // Bound memory without a timer: drop the oldest key once the table is full.
    if (!entry && buckets.size >= maxKeys) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
    if (!entry) {
      entry = { hits: [] };
      buckets.set(key, entry);
    }

    prune(entry, at);

    if (entry.hits.length >= limit) {
      const oldest = entry.hits[0];
      return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - at) };
    }
    entry.hits.push(at);
    return { allowed: true };
  }

  function reset(key: string) {
    buckets.delete(key);
  }

  function size() {
    return buckets.size;
  }

  return { check, reset, size };
}

/** Registration and reset share one budget per address, and one per source IP. */
export const signupThrottle = createThrottle({ limit: 5, windowMs: 15 * 60 * 1000 });
export const resetThrottle = createThrottle({ limit: 5, windowMs: 15 * 60 * 1000 });
export const ipThrottle = createThrottle({ limit: 20, windowMs: 15 * 60 * 1000 });
