import "server-only";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { tenantScopeEnabled } from "@/lib/db/tenant";
import { runInTenantTransaction } from "@/lib/db/tenant-client";

/**
 * Runs a request's database work inside its own tenant transaction.
 *
 * The organisation is resolved from the authenticated session through
 * getWorkspaceContext(), which reads the session and joins organizationMember.
 * It is never read from the request body, a query string, or a header, so a
 * caller cannot choose which tenant they are.
 *
 * Multi-workspace users are handled by that same helper: it honours the
 * active-workspace cookie but only after confirming the user is a member of the
 * workspace it selects.
 *
 * Flag off (the default): the work runs exactly as before, on the shared
 * connection. That is what keeps this change inert until it is switched on.
 * Flag on: the work runs in a transaction whose tenant is pinned, on a
 * connection that has been refused if it bypasses row level security.
 */
export async function withRequestTenant<T>(work: () => Promise<T>): Promise<T> {
  if (!tenantScopeEnabled()) {
    return work();
  }

  const workspace = await getWorkspaceContext();
  const organizationId = workspace?.user?.organizationId;
  if (!organizationId) {
    throw new Error("tenant_context_unavailable");
  }

  return runInTenantTransaction(
    { organizationId, userId: workspace.user.id ?? null },
    work
  );
}

type RouteHandler = (request: any, context: any) => Promise<Response>;

/**
 * Wraps a route handler so all of its database work happens in the caller's
 * tenant.
 *
 * The handler's own type is preserved exactly, so Next.js route typing and the
 * existing NextRequest signatures are untouched.
 *
 * Fails closed: when enforcement is on and there is no authenticated workspace,
 * the request is refused here rather than being allowed to run unscoped.
 *
 * With enforcement off the handler is called untouched, so authentication
 * responses stay byte-identical to today.
 */
export function withRequestTenantHandler<H extends RouteHandler>(handler: H): H {
  return (async (request: Request, context: unknown) => {
    if (!tenantScopeEnabled()) {
      return handler(request, context);
    }

    const workspace = await getWorkspaceContext();
    if (!workspace?.user?.organizationId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return runInTenantTransaction(
      {
        organizationId: workspace.user.organizationId,
        userId: workspace.user.id ?? null,
      },
      () => handler(request, context)
    );
  }) as unknown as H;
}
