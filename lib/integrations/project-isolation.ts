/**
 * One operator runs two businesses on two domains, and the standing rule is
 * strict separation: ROYAL HAROON assets never appear inside the ZOOKA-AI
 * workspace. Some of them were connected here before that rule existed, and
 * disconnecting them would break the other business's live publishing, so they
 * are excluded from what this workspace lists rather than deleted.
 *
 * This is deliberately a display/read boundary, not a credential change: the
 * rows stay untouched, and removing an entry from the list below brings the
 * connection back. Every identifier here belongs to the other business.
 */
const OTHER_PROJECT_MARKERS = ["royal", "رويال"] as const;

export interface IdentifiableConnection {
  displayName: string | null;
  accountEmail: string | null;
  /** Financial providers are never hidden: billing state must stay visible. */
  providerId?: string;
}

/**
 * The payment account is legally the other business entity, because that is the
 * registered company that owns the bank relationship. Hiding it would hide the
 * platform's own billing state from its owner, which is worse than the overlap.
 */
const ALWAYS_VISIBLE_PROVIDERS = new Set(["stripe"]);

export function belongsToOtherProject(connection: IdentifiableConnection) {
  if (connection.providerId && ALWAYS_VISIBLE_PROVIDERS.has(connection.providerId)) {
    return false;
  }
  const haystack = [connection.displayName, connection.accountEmail]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (haystack === "") {
    return false;
  }
  return OTHER_PROJECT_MARKERS.some((marker) => haystack.includes(marker));
}
