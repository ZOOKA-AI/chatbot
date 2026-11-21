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
}

export function belongsToOtherProject(connection: IdentifiableConnection) {
  const haystack = [connection.displayName, connection.accountEmail]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (haystack === "") {
    return false;
  }
  return OTHER_PROJECT_MARKERS.some((marker) => haystack.includes(marker));
}
