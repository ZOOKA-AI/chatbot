import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Carries the tenant transaction to the code that runs inside it.
 *
 * The Commander functions take no database argument: they use a shared handle.
 * Threading a transaction through every signature would touch twenty call sites
 * and would be forgotten by the twenty-first. Instead the request publishes its
 * transaction here, and the shared handle resolves to it for the duration of that
 * request only. If nothing is published, the handle falls back to the shared
 * connection, which is the unchanged behaviour when the flag is off.
 *
 * Deliberately typed as unknown: this module must not depend on the query
 * builder, so tests can publish any handle that behaves like one.
 */
export type CommanderDb = unknown;

const storage = new AsyncLocalStorage<CommanderDb>();

/** The transaction published for the current request, or null. */
export function commanderActiveDb(): CommanderDb {
  return storage.getStore() ?? null;
}

/** Runs work with `db` published as the active handle for this async context. */
export function runWithCommanderDb<T>(db: CommanderDb, work: () => Promise<T>): Promise<T> {
  return storage.run(db, work);
}
