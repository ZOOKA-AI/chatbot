// The table list a backup must contain.
//
// The export used to hardcode the fourteen tables that existed when it was
// written. Every table added afterwards — the TikTok publish queue, platform
// roles, the agent message log, webhook events, media jobs, blog posts — was
// silently left out, so a "successful" backup could not restore the product
// people were actually using. The list is now discovered from the database at
// run time and merged with a core list that the restore procedure depends on.

/**
 * Tables the restore procedure reads in a known order. They are requested even
 * when discovery misses them, because a backup without these cannot restore an
 * account at all.
 */
export const CORE_TABLES = [
  "User",
  "Organization",
  "OrganizationMember",
  "Invitation",
  "Subscription",
  "UsageEvent",
  "Chat",
  "Message",
  "Message_v2",
  "Vote",
  "Vote_v2",
  "Document",
  "Suggestion",
  "Stream",
] as const;

/** A bare SQL identifier. Anything else is refused rather than quoted. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export function isSafeTableName(name: unknown): name is string {
  return typeof name === "string" && SAFE_IDENTIFIER.test(name);
}

/**
 * Core tables first, in their fixed order, then everything else the database
 * reports. Unknown names are dropped, so a hostile or broken `table_name`
 * cannot reach the query builder.
 */
export function mergeTableList(discovered: readonly unknown[]): string[] {
  const ordered: string[] = [...CORE_TABLES];
  const seen = new Set<string>(ordered);
  const extra = discovered
    .filter(isSafeTableName)
    .filter((name) => !seen.has(name))
    .sort((a, b) => a.localeCompare(b));
  for (const name of extra) {
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

/** Core tables that discovery did not report — a restore blocker worth surfacing. */
export function missingCoreTables(discovered: readonly unknown[]): string[] {
  const present = new Set(discovered.filter(isSafeTableName));
  return CORE_TABLES.filter((name) => !present.has(name));
}
