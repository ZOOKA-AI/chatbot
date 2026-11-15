/**
 * Cursors for the execution history.
 *
 * Keyset, not offset: a cursor carries the last row's (createdAt, id), so a page
 * is "the next rows after exactly this one". That is what makes the ordering
 * stable when several tasks share a timestamp, and it is why paging does not
 * drift when rows are added while somebody is reading.
 *
 * The cursor is opaque and self-contained, but it is never trusted: it is parsed,
 * type-checked and only then used as a comparison value, never as SQL text.
 */

export type Cursor = { createdAt: Date; id: string };

const MAX_CURSOR_LENGTH = 200;

export function encodeCursor(createdAt: Date | string, id: string): string {
  const when = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  if (Number.isNaN(when.getTime())) {
    throw new TypeError("encodeCursor needs a real timestamp");
  }
  return Buffer.from(`${when.toISOString()}|${String(id)}`, "utf8").toString("base64url");
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

  const when = new Date(decoded.slice(0, split));
  const id = decoded.slice(split + 1);
  if (Number.isNaN(when.getTime())) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  return { createdAt: when, id };
}
