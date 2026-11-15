import "server-only";

/**
 * Tenant scope: one transaction, one organisation, no ambient state.
 *
 * THE TRUST BOUNDARY, stated plainly.
 * `app.organization_id` is a custom PostgreSQL GUC, not a security primitive.
 * Anything that can execute SQL on the connection can set it to any value, so it
 * is exactly as trustworthy as the code that writes it. That is why:
 *
 *   1. the value is written only by withTenantScope below, from a TenantContext
 *      that resolveTenantContext produced out of the authenticated session;
 *   2. resolveTenantContext reads the session and nothing else. A body field, a
 *      query parameter or an agent payload that happens to be named
 *      organizationId is never consulted, so a client cannot assert a tenant;
 *   3. the value is bound as a parameter and must be a UUID, so a value that
 *      carries SQL cannot be smuggled into it;
 *   4. it is set with is_local = true inside an explicit transaction, so it dies
 *      at COMMIT and cannot ride a pooled connection into the next request;
 *   5. the role executing the work is checked first: if the connection is a
 *      superuser or a BYPASSRLS role, the transaction is refused rather than
 *      silently running without the protection it claims.
 *
 * What this does NOT do: it does not protect against an attacker who already has
 * SQL execution on the connection. Nothing at this layer can. RLS is here to make
 * a forgotten predicate harmless, and role separation is here to make the policy
 * apply to the application itself.
 */

export const TENANT_SETTING = "app.organization_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type TenantContext = {
  organizationId: string;
  /** Present when the caller is a signed-in user; null for service-initiated work. */
  userId: string | null;
};

export type TenantScopeErrorCode =
  | "missing_context"
  | "invalid_context"
  | "privileged_role"
  | "flag_disabled";

export class TenantScopeError extends Error {
  readonly code: TenantScopeErrorCode;
  constructor(code: TenantScopeErrorCode, message: string) {
    super(message);
    this.name = "TenantScopeError";
    this.code = code;
  }
}

/**
 * Derives the tenant from server-side authorization only.
 *
 * The shape it accepts is the one the app already has after authentication. It
 * deliberately ignores every other field on the object: passing a request body
 * here cannot change the answer, because the body is never read.
 */
const REQUEST_CONTAINERS = ["body", "payload", "input", "params", "query", "searchParams"];

export function resolveTenantContext(session: unknown): TenantContext | null {
  if (!session || typeof session !== "object") return null;

  const record = session as Record<string, unknown>;

  // An object that also carries a request container is a merged object: session
  // fields and request fields in one place, where a client-supplied value could
  // win. Refuse it outright (fail closed) instead of guessing which field is
  // authoritative.
  for (const key of REQUEST_CONTAINERS) {
    const container = record[key];
    if (container && typeof container === "object" && "organizationId" in container) {
      return null;
    }
  }

  const organizationId =
    (typeof record.organizationId === "string" && record.organizationId) ||
    (() => {
      const user = record.user as Record<string, unknown> | undefined;
      return typeof user?.organizationId === "string" ? user.organizationId : "";
    })();

  if (!isUuid(organizationId)) return null;

  const user = record.user as Record<string, unknown> | undefined;
  const userId = typeof user?.id === "string" && isUuid(user.id) ? user.id : null;

  return { organizationId, userId };
}

/** The minimum a transaction handle must offer. Keeps this testable without a pool. */
export type TenantTx = {
  query<T = Record<string, unknown>>(
    statement: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
};

export type TenantRunner = {
  transaction<T>(work: (tx: TenantTx) => Promise<T>): Promise<T>;
};

/**
 * Refuses to run tenant work on a connection whose role can ignore RLS.
 *
 * This is the "no accidental privileged fallback" rule: if somebody points
 * DATABASE_URL_TENANT at the superuser by mistake, the request fails instead of
 * succeeding without the isolation it was supposed to have.
 */
export async function assertUnprivilegedRole(tx: TenantTx) {
  const { rows } = await tx.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    "select rolsuper, rolbypassrls from pg_roles where rolname = current_user"
  );
  const role = rows[0];
  if (!role) {
    throw new TenantScopeError("privileged_role", "cannot determine the current role");
  }
  if (role.rolsuper || role.rolbypassrls) {
    throw new TenantScopeError(
      "privileged_role",
      "tenant-scoped work refused: the connection role bypasses row level security"
    );
  }
}

export function tenantScopeEnabled() {
  return process.env.TENANT_RLS_ENABLED === "on";
}

/**
 * Runs work inside an explicit transaction whose tenant is set for that
 * transaction only.
 *
 * Errors roll the transaction back, so a half-written cross-tenant operation
 * cannot survive a failure.
 */
export async function withTenantScope<T>(
  runner: TenantRunner,
  context: TenantContext | null,
  work: (tx: TenantTx) => Promise<T>
): Promise<T> {
  if (!context) {
    throw new TenantScopeError("missing_context", "no authenticated organisation");
  }
  if (!isUuid(context.organizationId)) {
    throw new TenantScopeError("invalid_context", "organisation is not a valid identifier");
  }

  return runner.transaction(async (tx) => {
    // is_local = true: bound to this transaction, gone at COMMIT.
    await tx.query("select set_config($1, $2, true)", [
      TENANT_SETTING,
      context.organizationId,
    ]);

    // Read it back: what the policies will use must be exactly what was resolved.
    const { rows } = await tx.query<{ current: string | null }>(
      "select current_setting($1, true) as current",
      [TENANT_SETTING]
    );
    if (rows[0]?.current !== context.organizationId) {
      throw new TenantScopeError("invalid_context", "tenant context did not take effect");
    }

    await assertUnprivilegedRole(tx);
    return work(tx);
  });
}
