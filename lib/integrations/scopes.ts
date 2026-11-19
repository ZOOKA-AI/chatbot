/**
 * Scopes reach the settings page from four different places: the declarative
 * connector specs (arrays), an OAuth token response (a space-delimited string,
 * RFC 6749 §3.3), the `integration_connection.scopes` jsonb column (whatever a
 * writer put there), and rows written before scopes were normalized. The page
 * renders them with `.join()`, so a single string in that column used to take
 * the whole settings page down with "scopes.join is not a function".
 *
 * Every read and write path therefore goes through this function: it always
 * returns a clean string array, whatever it was handed.
 */
export function normalizeScopes(value: unknown): string[] {
  const split = (entry: string) =>
    entry
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

  const collected: string[] = [];

  if (typeof value === "string") {
    collected.push(...split(value));
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        collected.push(...split(entry));
      }
    }
  }

  return [...new Set(collected)];
}
