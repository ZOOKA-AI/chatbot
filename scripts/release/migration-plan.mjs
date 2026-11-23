// Lists which journal migrations the target database has not applied yet. Read-only.
//
// Drizzle records each applied migration in drizzle.__drizzle_migrations with `created_at` set to
// the journal entry's `when`. Anything in the journal newer than the latest recorded entry is
// pending and would be applied, all together, by `pnpm db:migrate`.
//
// Usage: DATABASE_URL=... node scripts/release/migration-plan.mjs
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const journal = JSON.parse(readFileSync("lib/db/migrations/meta/_journal.json", "utf8"));
const sql = postgres(url, { max: 1, prepare: false });

try {
  const [{ exists }] = await sql`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  let latest = 0;
  let applied = 0;
  if (exists) {
    const [row] = await sql`
      select count(*)::int as applied, coalesce(max(created_at), 0)::bigint as latest
      from drizzle.__drizzle_migrations`;
    applied = row.applied;
    latest = Number(row.latest);
  }
  const pending = journal.entries.filter((entry) => entry.when > latest);
  console.log(`Journal entries: ${journal.entries.length}`);
  console.log(`Recorded as applied in the database: ${applied}`);
  if (pending.length === 0) {
    console.log("Pending: none. The database is up to date.");
  } else {
    console.log(`Pending (${pending.length}), in the order db:migrate would apply them:`);
    for (const entry of pending) console.log(`  - ${entry.tag}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "## Production migration plan",
      `Applied: ${applied} of ${journal.entries.length}`,
      pending.length ? `Pending:\n${pending.map((e) => `- \`${e.tag}\``).join("\n")}` : "Pending: none",
    ];
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n\n")}\n`);
  }
} finally {
  await sql.end();
}
