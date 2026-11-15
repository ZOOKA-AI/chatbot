import {
  MemoryThrottleStore,
  PostgresThrottleStore,
  ResilientThrottleStore,
  type SqlExecutor,
  type ThrottleStore,
} from "@/lib/auth/throttle-store";

/**
 * Which counter store the running application uses.
 *
 * Default: in-memory. That is a per-instance limit, NOT a complete production
 * control: on a host that runs several instances each one counts on its own.
 *
 * Shared: set AUTH_THROTTLE_STORE=postgres after the "AuthThrottle" table has
 * been created (lib/db/migrations/pending/auth_throttle.sql). Then every
 * instance counts in the same rows, and a database error falls back to the
 * in-memory counter for that call instead of removing the limit.
 *
 * State of evidence: the Postgres store's SQL is verified on a real PostgreSQL
 * engine (PGlite). The few lines below that hand it a postgres.js connection
 * have not run against a server, because no database is reachable from the
 * development environment. That is why the switch is off by default.
 */

export type ThrottleMode = "memory" | "postgres";

export function throttleModeFromEnv(
  env: Record<string, string | undefined> = process.env
): ThrottleMode {
  const url = env.DATABASE_URL ?? env.POSTGRES_URL;
  return env.AUTH_THROTTLE_STORE === "postgres" && url ? "postgres" : "memory";
}

let store: ThrottleStore | null = null;

async function postgresExecutor(url: string): Promise<SqlExecutor> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 5 });
  return async (text, params) =>
    (await sql.unsafe(text, params as never[])) as unknown as Record<string, unknown>[];
}

export function getThrottleStore(): ThrottleStore {
  if (store) return store;
  const memory = new MemoryThrottleStore();
  if (throttleModeFromEnv() !== "postgres") {
    store = memory;
    return store;
  }
  const url = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL) as string;
  let executor: Promise<SqlExecutor> | null = null;
  const lazy: SqlExecutor = async (text, params) => {
    executor ??= postgresExecutor(url);
    return (await executor)(text, params);
  };
  store = new ResilientThrottleStore(new PostgresThrottleStore(lazy), memory);
  return store;
}

/** Tests only. */
export function setThrottleStoreForTests(next: ThrottleStore | null): void {
  store = next;
}
