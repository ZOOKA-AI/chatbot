import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The lead ingest key is derived from AUTH_SECRET instead of adding another
 * environment variable that would have to be rotated by hand. Anyone holding
 * the derived key can only create or refresh leads, nothing else.
 */
export function getLeadsIngestKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }
  return createHmac("sha256", secret).update("zooka-leads-ingest").digest("hex");
}

export function isLeadsIngestKeyValid(provided: string | null) {
  const expected = getLeadsIngestKey();
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
