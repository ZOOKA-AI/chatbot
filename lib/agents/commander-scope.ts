import "server-only";

import { resolveCaller } from "@/lib/agents/auth";
import { TenantScopeError, tenantScopeEnabled } from "@/lib/db/tenant";
import { runInTenantTransaction } from "@/lib/db/tenant-client";

/**
 * Makes a Commander route run on the tenant connection.
 *
 * Until this existed the tenant machinery was unreachable: every route called the
 * command-center functions, which used the shared connection, so the policies were
 * never consulted for a real request. Wrapping the handler is what connects the
 * two halves.
 *
 * Flag off: the handler runs exactly as before, on the shared connection. That is
 * the current production behaviour and it is why nothing changes today.
 *
 * Flag on: the caller is resolved first (an agent key or an owner session), and
 * only then is a tenant transaction opened for the organisation that caller
 * belongs to. The organisation is never read from the request body.
 */
export async function withCommanderScope<T>(
  organizationId: string | null | undefined,
  work: () => Promise<T>,
  userId: string | null = null
): Promise<T> {
  if (!tenantScopeEnabled()) {
    return work();
  }
  if (!organizationId) {
    throw new TenantScopeError("missing_context", "no authenticated organisation");
  }
  // The policies resolve the organisation through app_platform_org(), which honours
  // it only for an authenticated member (request.jwt.claims.sub). Without the user
  // every owner read came back empty and every insert failed its WITH CHECK.
  return runInTenantTransaction({ organizationId, userId: userId ?? null }, work);
}

type SimpleHandler = (request: Request) => Promise<Response>;
type HandlerWithContext<C> = (request: Request, context: C) => Promise<Response>;

/**
 * Wraps a route handler so its Commander work happens inside the caller's tenant.
 *
 * A caller with no organisation is passed through untouched: the handler then
 * produces its own 401/403, which keeps the auth responses exactly as they are.
 */
export function withCommanderTenant(handler: SimpleHandler): SimpleHandler;
export function withCommanderTenant<C>(handler: HandlerWithContext<C>): HandlerWithContext<C>;
export function withCommanderTenant(
  handler: (request: Request, context?: never) => Promise<Response>
): (request: Request, context?: never) => Promise<Response> {
  return async (request: Request, context?: never) => {
    if (!tenantScopeEnabled()) return handler(request, context);

    const caller = await resolveCaller(request);
    const organizationId = caller
      ? caller.kind === "agent"
        ? caller.agent.organizationId
        : caller.organizationId
      : null;
    if (!organizationId) return handler(request, context);

    const userId = caller && caller.kind === "owner" ? caller.userId : null;
    return withCommanderScope(organizationId, () => handler(request, context), userId);
  };
}
