import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { db } from "./queries";
import {
  getTenantScope,
  runWithTenantStore,
  TenantContextMissingError,
  TenantForbiddenError,
  type TenantScope,
  tenantRlsEnabled,
} from "./tenant-context";

export {
  getTenantScope,
  requireTenantScope,
  TenantContextMissingError,
  TenantForbiddenError,
  tenantRlsEnabled,
  type TenantScope,
} from "./tenant-context";

/**
 * Opens a tenant scope around `fn`.
 *
 * With TENANT_RLS_ENABLED on, the scope is a real transaction whose session
 * carries app.current_user_id / app.current_org_id, so every statement issued
 * through the `db` proxy inside `fn` is filtered by row level security. With
 * the flag off the same scope is still established (so authorization bugs are
 * found before the flag flips) but statements use the ordinary connection.
 */
export async function runInTenantScope<T>(
  scope: TenantScope,
  fn: (scopedDb: typeof db) => Promise<T>
): Promise<T> {
  if (!tenantRlsEnabled()) {
    return runWithTenantStore({ scope, tx: undefined }, () => fn(db));
  }

  return db.transaction(async (tx) => {
    // set_config(..., true) is transaction-local: it cannot leak to the next
    // borrower of this pooled connection.
    await tx.execute(
      sql`select set_config('app.current_user_id', ${scope.userId}, true)`
    );
    await tx.execute(
      sql`select set_config('app.current_org_id', ${scope.organizationId}, true)`
    );
    await tx.execute(
      sql`select set_config('app.current_org_role', ${scope.role}, true)`
    );
    return runWithTenantStore({ scope, tx }, () => fn(db));
  });
}

/** Rejects a tenant identifier that came from the client and disagrees with the session. */
export function assertTenantMatches(clientTenantId: string | null | undefined): void {
  if (!clientTenantId) {
    return;
  }
  const scope = getTenantScope();
  if (!scope || scope.organizationId !== clientTenantId) {
    throw new TenantForbiddenError(
      "The provided workspace identifier does not belong to this session"
    );
  }
}

type AnyRouteHandler = (...args: never[]) => Promise<Response> | Response;

/**
 * Wraps a route handler so the request runs inside a tenant scope.
 *
 * Authentication is resolved on the server from the session, never from the
 * request body or query string. Handlers keep their original signature, so
 * wrapping a route does not change its contract.
 */
export function withRequestTenantHandler<H extends AnyRouteHandler>(
  handler: H
): H {
  const wrapped = async (
    ...args: Parameters<H>
  ): Promise<Response | undefined> => {
    const context = await getWorkspaceContext();
    if (!context) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const scope: TenantScope = {
      userId: context.user.id,
      organizationId: context.organizationId,
      role: String(context.role),
      source: "session",
    };

    try {
      return await runInTenantScope(scope, async () => handler(...args));
    } catch (error) {
      if (error instanceof TenantForbiddenError) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (error instanceof TenantContextMissingError) {
        return NextResponse.json(
          { error: "tenant_context_missing" },
          { status: 500 }
        );
      }
      throw error;
    }
  };

  return wrapped as unknown as H;
}
