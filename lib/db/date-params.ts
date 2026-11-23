import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

/**
 * drizzle-orm's postgres-js driver replaces the client's date serializers with a
 * pass-through, because values bound through table columns are already turned
 * into strings by the column mapper. Values interpolated into a raw `sql`
 * template are not mapped, so a `Date` reached postgres-js as an object and the
 * query failed with ERR_INVALID_ARG_TYPE ("The string argument must be of type
 * string ... Received an instance of Date"). After the 0.34 -> 0.45 upgrade this
 * broke every raw query with a date parameter, e.g. GET /api/agents/status.
 *
 * The serializers below keep strings as they are (so column-mapped values are
 * untouched) and turn a Date into ISO text. Parsers are not changed.
 */
const DATE_TYPES = ["1184", "1114", "1082", "1083"] as const;

export function dateSafeSerialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

export function restoreDateSerializers(client: postgres.Sql): void {
  const serializers = client?.options?.serializers as
    | Record<string, (v: unknown) => unknown>
    | undefined;
  if (!serializers) return;
  for (const type of DATE_TYPES) serializers[type] = dateSafeSerialize;
}

/** drizzle() that leaves Date parameters in raw sql templates working. */
export function drizzleDateSafe(client: postgres.Sql, config?: { logger?: boolean }) {
  const db = config ? drizzle(client, config) : drizzle(client);
  // drizzle() rewrites the serializers on every call, so re-apply each time.
  restoreDateSerializers(client);
  return db;
}
