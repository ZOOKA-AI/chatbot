/**
 * One refresh at a time per creator.
 *
 * TikTok rotates the refresh token when it issues a new one. Two requests that
 * both notice an expired access token would both spend the same refresh token;
 * the loser is told invalid_grant, and if that answer is believed the creator's
 * connection is gone for good and only a new OAuth round trip brings it back.
 *
 * The map holds the in-flight promise, so a second caller joins the first
 * instead of starting a second refresh. It is per process, which is enough to
 * remove the burst that happens when a page fires several requests at once; it
 * is not a distributed lock and this comment says so rather than implying more.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const started = work().finally(() => {
    // Cleared on both outcomes: a failed refresh must be retryable, and a
    // successful one must not be replayed from cache forever.
    inFlight.delete(key);
  });
  inFlight.set(key, started);
  return started;
}

/** Test seam: the map is module state, so a test needs to see it empty. */
export function inFlightCount(): number {
  return inFlight.size;
}
