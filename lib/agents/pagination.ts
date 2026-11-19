/**
 * Cursors for the execution history.
 *
 * Keyset, not offset: a cursor carries the last row's exact (createdAt, id), so a
 * page is "the rows after exactly this one". That is what makes the ordering
 * stable when several tasks share a timestamp, and why paging does not drift when
 * rows are added while somebody is reading.
 *
 * The stamp is the database's own text rendering with microseconds, not a
 * JavaScript date: a date holds milliseconds, and a cursor truncated to
 * milliseconds can neither equal a microsecond row nor be compared against the
 * column without applying a function to it. Keeping the exact stamp lets the
 * query compare the indexed column itself.
 *
 * The cursor is opaque and never trusted: it is parsed, type-checked, and only
 * then bound as a parameter, never concatenated into SQL.
 */

export type Cursor = {
  /** Exact timestamp text, microseconds included. */
  stamp: string;
  /** Parsed form, for callers that want a date. Never used as the boundary. */
  createdAt: Date;
  id: string;
};

const MAX_CURSOR_LENGTH = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(createdAt: Date | string, id: string): string {
  const stamp =
    createdAt instanceof Date
      ? createdAt.toISOString()
      : String(createdAt).replace(" ", "T");
  if (Number.isNaN(new Date(stamp).getTime())) {
    throw new TypeError("encodeCursor needs a real timestamp");
  }
  if (!UUID.test(id)) {
    throw new TypeError("encodeCursor needs a real identifier");
  }
  return Buffer.from(`${stamp}|${id}`, "utf8").toString("base64url");
}

/** Returns null for anything that is not a cursor this application issued. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > MAX_CURSOR_LENGTH) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const split = decoded.lastIndexOf("|");
  if (split <= 0) return null;

  const stamp = decoded.slice(0, split);
  const id = decoded.slice(split + 1);
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!UUID.test(id)) return null;

  return { stamp, createdAt: parsed, id };
}
