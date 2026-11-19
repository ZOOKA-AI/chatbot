/**
 * Readiness probe for any container that only needs to answer "can I reach the database".
 *
 * The full execution health (queue depth, stalled leases, failure bursts) lives at
 * /api/agents/health behind owner authentication, because it names workspaces. This is
 * the infrastructure-level answer only, and it never prints a connection string.
 */

import postgres from "postgres";

async function main() {
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("no DATABASE_URL");
  process.exit(1);
}

const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 5000);
const sql = postgres(url, { max: 1, connect_timeout: Math.ceil(timeoutMs / 1000), onnotice: () => {} });

try {
  const started = Date.now();
  const [row] = await sql<{ ok: number }[]>`select 1 as ok`;
  console.log(JSON.stringify({ ok: row?.ok === 1, latencyMs: Date.now() - started }));
  await sql.end({ timeout: 2 });
  process.exit(row?.ok === 1 ? 0 : 1);
} catch (error) {
  // The message is deliberately not printed verbatim: connection errors can embed the URL.
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.name : "unknown" }));
  process.exit(1);
}
}

void main();
