// Production migration helper. Read-only unless --apply is given.
//
// Production was built without drizzle's tracking table (drizzle.__drizzle_migrations), so the
// journal cannot say what is applied. Instead this reads every migration file, finds the tables it
// creates, and checks whether those tables exist in the target database.
//
//   node scripts/release/migration-plan.mjs                 -> plan: list migrations whose tables are missing
//   node scripts/release/migration-plan.mjs --apply a.sql,b.sql -> run exactly those files, in order,
//                                                             each in its own transaction, then re-plan
//
// The connection string comes from DATABASE_URL and is never printed.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DIR = "lib/db/migrations";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const applyArg = process.argv.indexOf("--apply");
const toApply =
  applyArg === -1
    ? []
    : (process.argv[applyArg + 1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

function migrationFiles() {
  const top = readdirSync(DIR).filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"));
  const pending = readdirSync(path.join(DIR, "pending"))
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .map((f) => `pending/${f}`);
  return [...top.sort(), ...pending.sort()];
}

function createdTables(text) {
  const names = new Set();
  for (const match of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gi)) {
    names.add(`${match[1] ?? "public"}.${match[2]}`);
  }
  return [...names];
}

function resolveFile(name) {
  const clean = name.replace(/^lib\/db\/migrations\//, "");
  if (!/^(pending\/)?[\w-]+\.sql$/.test(clean)) throw new Error(`Not a migration file name: ${name}`);
  return path.join(DIR, clean);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

async function plan(label) {
  const rows = [];
  for (const file of migrationFiles()) {
    const tables = createdTables(readFileSync(path.join(DIR, file), "utf8"));
    if (tables.length === 0) continue;
    const missing = [];
    for (const table of tables) {
      const [{ present }] = await sql`select to_regclass(${`"${table.split(".")[0]}"."${table.split(".")[1]}"`}) is not null as present`;
      if (!present) missing.push(table);
    }
    if (missing.length) rows.push({ file, missing });
  }
  console.log(`\n${label}`);
  if (rows.length === 0) console.log("Every table created by a migration file exists.");
  for (const row of rows) console.log(`  - ${row.file}: missing ${row.missing.join(", ")}`);
  console.log("Note: files that only grant or alter (no CREATE TABLE) are not detectable here; name them explicitly when applying.");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const body = rows.length ? rows.map((r) => `- \`${r.file}\`: missing ${r.missing.join(", ")}`).join("\n") : "No missing tables.";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${label}\n\n${body}\n\n`);
  }
}

try {
  await plan("Plan (read-only)");
  if (toApply.length) {
    for (const name of toApply) {
      const file = resolveFile(name);
      const statements = readFileSync(file, "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      await sql.begin(async (tx) => {
        for (const statement of statements) await tx.unsafe(statement);
      });
      console.log(`Applied ${name} (${statements.length} statement(s)).`);
    }
    await plan("Plan after apply");
  }
} finally {
  await sql.end();
}
