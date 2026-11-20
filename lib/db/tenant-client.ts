import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  tenantScopeEnabled,
  TENANT_SETTING,
  TENANT_USER_SETTING,
  TenantScopeError,
  assertUnprivilegedRole,
  isUuid,
  type TenantContext,
  type TenantRunner,
  type TenantTx,
} from "./tenant";
import { runWithCommanderDb } from "./tenant-context";

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

/**
 * Runs work inside a tenant transaction on the runtime connection, publishing the
 * transaction's query builder so the Commander functions use it automatically.
 *
 * Returns the work's own value; the transaction commits only if the work resolves.
 */
export async function runInTenantTransaction<T>(
  context: TenantContext | null,
  work: () => Promise<T>
): Promise<T> {
  if (!context) {
    throw new TenantScopeError("missing_context", "no authenticated organisation");
  }
  if (!isUuid(context.organizationId)) {
    throw new TenantScopeError("invalid_context", "organisation is not a valid identifier");
  }

  const base = drizzle(client());

  // drizzle's own transaction, so the handle published below is a real query
  // builder over one pinned connection rather than a foreign object.
  return base.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${context.organizationId}, true)`);

    // Membership rows and other user-owned data are looked up by user id before
    // any organisation is known (workspace resolution at login). Without this the
    // user-owned policies would see no user and fail closed on a valid session.
    if (context.userId) {
      await tx.execute(sql`select set_config(${TENANT_USER_SETTING}, ${context.userId}, true)`);

      // app_is_member() reads auth.uid(), which resolves the JWT claim and not
      // app.user_id. Without the claim every member-scoped policy evaluates to
      // false and the tables only stay readable because a parallel
      // app.organization_id policy happens to exist. Publishing the claim is what
      // makes those five policies mean what their names say.
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: context.userId, role: "authenticated" })}, true)`
      );
      await tx.execute(
        sql`select set_config('request.jwt.claim.sub', ${context.userId}, true)`
      );
    }

    // drizzle's postgres-js driver returns the row list itself, not a { rows } envelope.
    const applied = await tx.execute<{ current: string | null }>(
      sql`select current_setting(${TENANT_SETTING}, true) as current`
    );
    if (applied[0]?.current !== context.organizationId) {
      throw new TenantScopeError("invalid_context", "tenant context did not take effect");
    }

    // Refuses a superuser or BYPASSRLS connection before any Commander work runs.
    const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`
    );
    const current = role[0];
    if (!current) {
      throw new TenantScopeError("privileged_role", "cannot determine the current role");
    }
    if (current.rolsuper || current.rolbypassrls) {
      throw new TenantScopeError(
        "privileged_role",
        "tenant-scoped work refused: the connection role bypasses row level security"
      );
    }

    return runWithCommanderDb(tx, () => work());
  }) as Promise<T>;
}

/**
 * Work that runs after the request's own transaction is gone (a streaming
 * onFinish, an after() callback) and still has to land in the caller's tenant.
 *
 * Flag off, the work runs on the shared connection exactly like every other
 * route. Calling runInTenantTransaction unconditionally here made production,
 * where DATABASE_URL_TENANT is deliberately absent, throw on every chat finish:
 * the reply streamed but was never saved.
 */
export function runAfterResponseInTenant<T>(
  context: TenantContext | null,
  work: () => Promise<T>
): Promise<T> {
  if (!tenantScopeEnabled()) {
    return work();
  }
  return runInTenantTransaction(context, work);
}
