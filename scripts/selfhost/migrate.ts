/**
 * Migration runner for a self-hosted install.
 *
 * Deliberately not `drizzle-kit migrate`: the repository's journal is inconsistent (see
 * docs/engineering), so the numbered SQL files are the source of truth here, applied in
 * filename order and recorded by filename. Re-running is a no-op.
 *
 * The production guard exists because this exact script will be pointed at the wrong
 * database at some point, and the difference between a self-host demo and the live
 * product should not be one keystroke.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import postgres from "postgres";

const PRODUCTION_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];

const migrationsRoot = join(process.cwd(), "lib/db/migrations");

async function collect(): Promise<{ name: string; sql: string }[]> {
  const out: { name: string; sql: string }[] = [];
  const root = await readdir(migrationsRoot, { withFileTypes: true });
  for (const entry of root.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith(".sql")) {
      out.push({ name: entry.name, sql: await readFile(join(migrationsRoot, entry.name), "utf8") });
    } else if (entry.isDirectory() && entry.name === "pending") {
      const pending = await readdir(join(migrationsRoot, entry.name));
      // `*.down.sql` is a rollback, not a migration. Applying it in sort order silently undoes the
      // pending migration that sorts just before it (measured on an isolated clone: 0058 added two
      // columns and its own down file removed them in the same run). Never enqueue them.
      for (const file of pending.filter((name) => !name.endsWith(".down.sql")).sort()) {
        if (!file.endsWith(".sql") || file.endsWith(".down.sql")) continue;
        out.push({ name: `pending/${file}`, sql: await readFile(join(migrationsRoot, entry.name, file), "utf8") });
      }
    }
  }
  return out;
}

async function main() {
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!process.env.ALLOW_PRODUCTION_DATABASE && PRODUCTION_HOSTS.some((host) => url.includes(host))) {
  console.error("refusing to migrate a production database: set ALLOW_PRODUCTION_DATABASE=yes only for the real release procedure");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

const applied: string[] = [];
const skipped: string[] = [];
const failed: Record<string, string> = {};

await sql`
  create table if not exists "_selfhost_migrations" (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

const done = new Set((await sql<{ name: string }[]>`select name from "_selfhost_migrations"`).map((row) => row.name));

for (const migration of await collect()) {
  if (done.has(migration.name)) {
    skipped.push(migration.name);
    continue;
  }
  try {
    // Whole file in one transaction where it can be: a half-applied migration is worse
    // than a failed one.
    await sql.unsafe(migration.sql);
    await sql`insert into "_selfhost_migrations" (name) values (${migration.name}) on conflict do nothing`;
    applied.push(migration.name);
  } catch (error) {
    failed[migration.name] = error instanceof Error ? error.message.slice(0, 400) : String(error);
  }
}

console.log(JSON.stringify({ applied, skipped: skipped.length, failed }, null, 2));
await sql.end({ timeout: 5 });
process.exit(Object.keys(failed).length === 0 ? 0 : 1);
}

void main();
