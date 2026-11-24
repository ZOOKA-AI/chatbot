import "server-only";

import type { drizzle } from "drizzle-orm/postgres-js";
import { drizzleDateSafe } from "@/lib/db/date-params";
import postgres from "postgres";

import { tenantScopeEnabled } from "./tenant";

/**
 * The bootstrap connection.
 *
 * Row level security is enforced per tenant, which means a tenant transaction can
 * only write rows for a tenant the caller already belongs to. Some operations
 * genuinely happen before that is true:
 *
 *   * onboarding: the first organisation and its first membership
 *   * membership changes performed by an administrator of that organisation
 *   * subscription lifecycle driven by a signature-verified Stripe webhook
 *
 * Those cannot be expressed as a tenant policy without letting any user add
 * themselves to any organisation, which is the escalation the WITH CHECK clause
 * exists to prevent. They therefore use a separate, explicitly scoped connection
 * instead of weakening the policy.
 *
 * This is not the ordinary request path. Ordinary application requests run on the
 * runtime role. If this URL is absent, callers fall back to the shared connection,
 * which is the current behaviour while enforcement is off.
 */

/** Production project refs that must never be reached from a preview path. */
const FORBIDDEN_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];

let cached: ReturnType<typeof postgres> | null = null;
let cachedDb: ReturnType<typeof drizzle> | null = null;

/** True when a bootstrap connection is configured and enforcement is on. */
export function serviceConnectionAvailable(): boolean {
  return tenantScopeEnabled() && Boolean(process.env.DATABASE_URL_SERVICE);
}

export function serviceDb(): ReturnType<typeof drizzle> {
  const url = process.env.DATABASE_URL_SERVICE;
  if (!url) {
    throw new Error("DATABASE_URL_SERVICE is not configured");
  }

  const forbidden = FORBIDDEN_HOSTS.find((host) => url.includes(host));
  if (forbidden) {
    throw new Error("refusing to use a production project as the bootstrap connection");
  }

  if (!cached) {
    cached = postgres(url, {
      prepare: false,
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  if (!cachedDb) {
    cachedDb = drizzleDateSafe(cached);
  }
  return cachedDb;
}
