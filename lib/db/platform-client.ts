import postgres from "postgres";

/**
 * A cross-tenant connection, for the one job that genuinely has no tenant: the
 * scheduler, which must choose work across workspaces before it can hand each
 * task to that workspace's own transaction.
 *
 * This is a deliberately separate credential from the runtime and tenant ones. It
 * is never used to read or write anybody's data beyond the queue selection, and
 * it refuses production hosts outright so a preview cannot reach across tenants in
 * the real database.
 */

const FORBIDDEN_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];

export class PlatformUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlatformUnavailable";
  }
}

export function platformDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL_PLATFORM;
  if (url && url.trim()) {
    for (const host of FORBIDDEN_HOSTS) {
      if (url.includes(host)) {
        throw new PlatformUnavailable("platform_connection_points_at_production");
      }
    }
    return url;
  }
  // A development deployment without row-level security may reuse the main
  // connection: nothing is being bypassed because nothing is enforced. With RLS
  // on, a platform credential is required and no fallback is offered.
  if (process.env.TENANT_RLS_ENABLED !== "on") {
    return process.env.DATABASE_URL ?? null;
  }
  return null;
}

/**
 * Runs `fn` on a single-connection client and closes it afterwards. One
 * connection matters: the scheduler's overlap lock is session-scoped, so it must
 * be taken and released on the same socket.
 */
export async function withPlatformClient<T>(
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>
): Promise<T> {
  const url = platformDatabaseUrl();
  if (!url) throw new PlatformUnavailable("platform_connection_required");
  const client = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    return await fn(client);
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
}
