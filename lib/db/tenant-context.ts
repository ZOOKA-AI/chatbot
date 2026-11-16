import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped tenant context.
 *
 * This module contains no database imports on purpose: `lib/db/queries.ts`
 * imports it to decide which connection a query must run on, and the public
 * wrapper in `lib/db/tenant.ts` imports both. Keeping the storage in its own
 * leaf module prevents a cycle between the query layer and the guard layer.
 */

export type TenantScope = {
  userId: string;
  organizationId: string;
  role: string;
  /** Which credential the request proved itself with. */
  source: "session" | "service";
};

export type TenantStore = {
  scope: TenantScope;
  /** Transaction handle bound to the scoped connection, when one is open. */
  tx: unknown;
};

const storage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | null {
  return storage.getStore() ?? null;
}

export function getTenantScope(): TenantScope | null {
  return storage.getStore()?.scope ?? null;
}

export function requireTenantScope(): TenantScope {
  const scope = getTenantScope();
  if (!scope) {
    throw new TenantContextMissingError();
  }
  return scope;
}

/** Runs `fn` with the given store active. Nested calls inherit the inner store. */
export function runWithTenantStore<T>(store: TenantStore, fn: () => T): T {
  return storage.run(store, fn);
}

export class TenantContextMissingError extends Error {
  constructor(message = "Tenant context is required for this database operation") {
    super(message);
    this.name = "TenantContextMissingError";
  }
}

export class TenantForbiddenError extends Error {
  constructor(message = "Tenant identifier is not authorized for this request") {
    super(message);
    this.name = "TenantForbiddenError";
  }
}

/**
 * True when row level security should be trusted as the enforcement layer.
 * Off by default: the wrapper still establishes context, so call sites can be
 * migrated before the flag is flipped in an environment.
 */
export function tenantRlsEnabled(): boolean {
  return process.env.TENANT_RLS_ENABLED === "true";
}
