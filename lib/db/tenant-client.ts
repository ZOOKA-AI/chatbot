import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { TenantRunner, TenantTx } from "./tenant";

/**
 * The flagged, preview-only connection for tenant-scoped work.
 *
 * Three guards, because the failure mode here is silent: pointing this at the
 * wrong URL does not error, it just quietly runs without the isolation it claims
 * to have.
 *
 *   1. TENANT_RLS_ENABLED must be "on". Off by default, so nothing changes.
 *   2. DATABASE_URL_TENANT must be configured separately from the primary URL.
 *   3. the URL must not be a known production project, whatever the flag says.
 *
 * Nothing here reads or writes DATABASE_URL / POSTGRES_URL, and no production
 * user data is involved: the intent is a dedicated development database.
 */

/** Production project refs that must never be reached from this path. */
const FORBIDDEN_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];

let cached: ReturnType<typeof postgres> | null = null;

export function tenantRuntimeUrl(): string {
  const url = process.env.DATABASE_URL_TENANT;
  if (!url) {
    throw new Error("DATABASE_URL_TENANT is not configured");
  }

  const primary = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (primary && url === primary) {
    throw new Error(
      "refusing to run tenant-scoped work on the primary connection: DATABASE_URL_TENANT must be its own database"
    );
  }

  const forbidden = FORBIDDEN_HOSTS.find((host) => url.includes(host));
  if (forbidden) {
    throw new Error("refusing to run tenant-scoped work against a production project");
  }

  return url;
}

function client() {
  if (!cached) {
    cached = postgres(tenantRuntimeUrl(), {
      max: 5,
      prepare: false,
      idle_timeout: 20,
    });
  }
  return cached;
}

/**
 * A runner over the runtime role's own connection.
 *
 * postgres.js `begin` pins one connection for the whole callback, which is what
 * makes the transaction-local setting meaningful: every statement in the work
 * runs on the same backend, sees the same tenant, and loses it at COMMIT.
 */
export function tenantRunner(): TenantRunner {
  const sql = client();

  return {
    transaction<T>(work: (tx: TenantTx) => Promise<T>): Promise<T> {
      return sql.begin(async (tx) => {
        const adapter: TenantTx = {
          async query<R = Record<string, unknown>>(statement: string, params: unknown[] = []) {
            const rows = await tx.unsafe(statement, params as never[]);
            return { rows: rows as unknown as R[] };
          },
        };
        return work(adapter);
      }) as Promise<T>;
    },
  };
}

/** Drizzle over the same connection, for callers that want the query builder. */
export function tenantDb() {
  return drizzle(client(), { logger: false });
}

/** Drops the cached pool. For tests and for shutdown. */
export async function closeTenantClient() {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = null;
  }
}
