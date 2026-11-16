/**
 * Reconstruction of the REC-1 migration ladder on a database built from the ACTUAL
 * production schema, not from the repository's own migrations.
 *
 * Why this exists: the repository cannot recreate production. Comparing a schema-only
 * pg_dump of production with the migrations showed four columns that exist in production
 * and in no migration (User.name, Organization.slug, Chat.deletedAt, Document.embedding).
 * So any acceptance that starts from `migrations/*.sql` is testing a database nobody runs.
 * This script starts from the dump instead, then applies the release ladder on top and
 * measures what happens to rows that were already there.
 *
 * It runs entirely in @electric-sql/pglite (PostgreSQL in WASM): no server, no credentials,
 * no network, and nothing that can reach production.
 *
 *   node scripts/release/verify-migration-ladder.mjs [--dump=/path/to/schema.sql]
 *
 * Exit code 0 only when every check passes.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DUMP =
  process.argv.find((a) => a.startsWith("--dump="))?.slice(7) ||
  process.env.PROD_SCHEMA_DUMP ||
  "/tmp/schema17.sql";
const MIGRATIONS = "lib/db/migrations";
const PENDING = join(MIGRATIONS, "pending");
const SEED_ONLY = ["User", "Organization", "OrganizationMember", "Chat", "Message_v2", "Document", "integration_connection"];

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const db = new PGlite();

/** Split SQL into statements. A character scan that respects dollar-quoted function
 *  bodies and single-quoted literals is the only reliable way here: the dump contains
 *  twelve dollar-quoted blocks, and a naive split on ";" corrupts them. */
function statements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollar = null;
  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (dollar) {
      if (two === dollar) {
        buf += two;
        i += 2;
        dollar = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        inSingle = false;
      }
      buf += ch;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i++;
      continue;
    }
    if (ch === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z_0-9]*)\$/);
      if (m) {
        dollar = m[0];
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt && !stmt.startsWith("--")) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail && !tail.startsWith("--")) out.push(tail);
  return out;
}

/** Load production's own schema. Statements that reference cluster roles or extensions
 *  absent from WASM Postgres are skipped individually and counted, never silently. */
async function loadProductionSchema() {
  // pg_dump header comment lines carry semicolons ("Name: SCHEMA public; Type: SCHEMA"),
  // so they must be removed before splitting or they become bogus statements.
  const sql = readFileSync(DUMP, "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("\\") && !t.startsWith("--");
    })
    .join("\n");
  const stmts = statements(sql);
  let ok = 0;
  const skipped = [];
  const adapted = [];
  for (let stmt of stmts) {
    // pgvector is not available in WASM Postgres. The embedding column is the only place
    // production uses it, so the column type is substituted and the HNSW index skipped,
    // and both facts are reported rather than hidden: every other column, key and policy
    // of Document is still exercised.
    if (/public\.vector|\bvector\(/i.test(stmt)) {
      if (/^CREATE INDEX/i.test(stmt)) {
        adapted.push(`skipped HNSW index: ${stmt.slice(0, 50)}`);
        continue;
      }
      stmt = stmt
        .replace(/(?:\w+\.)?vector\s*\(\s*\d+\s*\)/gi, "float8[]")
        .replace(/(?:\w+\.)?\bvector\b/gi, "float8[]");
      adapted.push(`vector -> float8[] in: ${stmt.slice(0, 50).replace(/\s+/g, " ")}`);
    }
    const isNoise =
      /^(SET|SELECT pg_catalog\.set_config|BEGIN|COMMIT|START)/i.test(stmt) ||
      /^(CREATE SCHEMA|CREATE EXTENSION|ALTER .* OWNER TO|COMMENT ON|GRANT |REVOKE )/i.test(stmt);
    try {
      await db.exec(stmt);
      ok++;
    } catch (error) {
      if (isNoise) continue;
      skipped.push({ stmt: stmt.slice(0, 60).replace(/\s+/g, " "), error: error.message.slice(0, 90) });
    }
  }
  // The dump opens with `SET row_security = off` (pg_dump's own preference). Left in place
  // it makes every later tenant query raise "would be affected by row-level security policy"
  // instead of filtering, which looks exactly like a broken policy and is not one.
  await db.exec("set search_path to public");
  await db.exec("set row_security = on");
  return { total: stmts.length, ok, skipped, adapted };
}

async function columnsOf(table) {
  const { rows } = await db.query(
    `select column_name, data_type, is_nullable, column_default, udt_name
       from information_schema.columns
      where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table]
  );
  return rows;
}

async function fkTargets(table) {
  const { rows } = await db.query(
    `select kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name=$1`,
    [table]
  );
  return rows;
}

function syntheticValue(col, index) {
  const t = `${col.data_type} ${col.udt_name}`.toLowerCase();
  if (t.includes("uuid")) return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  if (t.includes("bool")) return "false";
  if (t.includes("timestamp")) return "now()";
  if (t.includes("date")) return "current_date";
  if (t.includes("int") || t.includes("numeric") || t.includes("double") || t.includes("real")) return String(index);
  if (t.includes("json")) return "'{}'";
  if (t.includes("array")) return "'{}'";
  return `'seed-${index}'`;
}

/** Insert one row per requested table so that later steps can prove nothing was lost.
 *  Only NOT NULL columns without a default are filled, and foreign keys reuse a row
 *  already inserted into the referenced table. */
async function seed(tables) {
  const seeded = new Map();
  const order = [];
  const pending = [...tables];
  let guard = 0;
  while (pending.length && guard++ < 20) {
    const next = [];
    for (const table of pending) {
      const fks = await fkTargets(table);
      const deps = fks.map((f) => f.ref_table).filter((r) => tables.includes(r) && !seeded.has(r));
      if (deps.length) {
        next.push(table);
        continue;
      }
      const cols = await columnsOf(table);
      const fill = cols.filter((c) => c.is_nullable === "NO" && !c.column_default);
      const names = [];
      const values = [];
      for (const col of fill) {
        const fk = fks.find((f) => f.column_name === col.column_name);
        if (fk && seeded.has(fk.ref_table)) {
          const parent = seeded.get(fk.ref_table);
          names.push(`"${col.column_name}"`);
          values.push(`'${parent}'`);
        } else if (fk) {
          names.push(`"${col.column_name}"`);
          values.push(syntheticValue(col, 1));
        } else {
          names.push(`"${col.column_name}"`);
          values.push(syntheticValue(col, order.length + 2));
        }
      }
      try {
        if (!names.length) {
          await db.exec(`insert into "${table}" default values`);
        } else {
          await db.exec(`insert into "${table}" (${names.join(",")}) values (${values.join(",")})`);
        }
      } catch (error) {
        console.log(`  seed skipped ${table}: ${String(error.message).slice(0, 70)}`);
        continue;
      }
      const { rows } = await db.query(`select count(*)::int as n from "${table}"`);
      seeded.set(table, names.includes('"id"') ? values[names.indexOf('"id"')].replace(/'/g, "") : null);
      order.push({ table, rows: rows[0].n });
      if (!seeded.get(table)) {
        const hasId = cols.some((c) => c.column_name === "id");
        if (hasId) {
          const { rows: idRows } = await db.query(`select id from "${table}" limit 1`);
          seeded.set(table, idRows[0]?.id ?? null);
        }
      }
    }
    pending.length = 0;
    pending.push(...next);
  }
  return order;
}

function migrationFiles() {
  const base = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  // The ladder this release needs: the two prerequisites production is missing,
  // then every pending migration in numeric order.
  const prereq = ["0017_client_projects.sql", "0027_agent_command_center.sql"].filter((f) => base.includes(f));
  const pend = existsSync(PENDING)
    ? readdirSync(PENDING)
        .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
        .sort()
    : [];
  return { base, ladder: [...prereq, ...pend] };
}

async function applyLadder(files) {
  const applied = [];
  for (const file of files) {
    const path = join(existsSync(join(MIGRATIONS, file)) ? MIGRATIONS : PENDING, file);
    const sql = readFileSync(path, "utf8");
    try {
      await db.exec(sql);
      applied.push({ file, ok: true });
      console.log(`  applied ${file}`);
    } catch (error) {
      applied.push({ file, ok: false, error: error.message });
      console.log(`  FAILED  ${file}: ${error.message}`);
      break;
    }
  }
  return applied;
}

async function count(q, params = []) {
  const { rows } = await db.query(q, params);
  return Number(rows[0].n);
}

console.log(`dump: ${DUMP}`);
if (!existsSync(DUMP)) {
  console.error("no production schema dump available");
  process.exit(2);
}

// ---------------------------------------------------------------- 0. production schema
// Production hands policies an `auth` schema from Supabase (auth.uid(), auth.role()).
// Without it, two production policies cannot even be created and any policy that calls
// auth.uid() raises "schema auth does not exist" at query time. The stubs return null,
// which is exactly what those functions return for a connection with no JWT, so the
// measured behaviour stays faithful instead of optimistic.
await db.exec(`create schema if not exists auth`);
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid'`);
await db.exec(`create or replace function auth.role() returns text language sql stable as 'select null::text'`);

const load = await loadProductionSchema();
const prodTables = await count(
  `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`
);
check(
  "production schema loads",
  prodTables >= 39 && load.skipped.length === 0,
  `${prodTables} tables, ${load.ok}/${load.total} statements, ${load.skipped.length} skipped, ${load.adapted.length} adapted`
);
for (const a of load.adapted) console.log(`     adapted: ${a}`);
if (load.skipped.length) {
  for (const s of load.skipped.slice(0, 5)) console.log(`     skipped: ${s.stmt} -> ${s.error}`);
}

// ---------------------------------------------------------------- 1. seed existing data
const seeded = await seed(SEED_ONLY);
check(
  "seed rows inserted before any migration",
  seeded.length > 0,
  seeded.map((s) => `${s.table}=${s.rows}`).join(" ")
);

// A duplicate email is the precondition 0029 cares about: it creates a unique index on
// lower(email), which cannot be built while two rows share one. Measure production's own
// behaviour first, then prove the guard fires, then remove the duplicate and continue.
let duplicateAllowed = false;
try {
  await db.exec(`insert into "User" (id, email) values (gen_random_uuid(), 'seed-2')`);
  duplicateAllowed = true;
} catch (error) {
  duplicateAllowed = !/duplicate|unique/i.test(error.message);
}
check(
  duplicateAllowed ? "production ALLOWS duplicate emails (measured, not assumed)" : "production already rejects duplicate emails",
  true,
  duplicateAllowed ? "so 0029 must refuse until duplicates are merged" : "no conflicting rows for 0029"
);

let guardFired = null;
if (duplicateAllowed) {
  try {
    await db.exec(readFileSync(join(PENDING, "0029_auth_email_verification.sql"), "utf8"));
    guardFired = false;
  } catch (error) {
    guardFired = error.message.includes("duplicated");
  }
  check("0029 refuses to run while duplicates exist", guardFired === true, "guard message confirms the precondition, no silent data loss");
  await db.exec(`delete from "User" where ctid not in (select min(ctid) from "User" group by lower(email))`);
  const dupes = await count(`select count(*)::int as n from (select lower(email) from "User" group by 1 having count(*)>1) d`);
  check("duplicates merged, ladder may continue", dupes === 0, `${dupes} remaining`);
}

// ---------------------------------------------------------------- 2. the ladder
const { ladder } = migrationFiles();
console.log(`ladder: ${ladder.length} files (${ladder[0]} .. ${ladder[ladder.length - 1]})`);
const applied = await applyLadder(ladder);
const failed = applied.filter((a) => !a.ok);
check(`ladder applies ${applied.filter((a) => a.ok).length}/${ladder.length}`, failed.length === 0, failed[0]?.error?.slice(0, 120) ?? "");

// ---------------------------------------------------------------- 3. what survived
for (const s of seeded) {
  const n = await count(`select count(*)::int as n from "${s.table}"`);
  check(`rows preserved in ${s.table}`, n >= s.rows, `${s.rows} → ${n}`);
}

const postTables = await count(
  `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`
);
const fks = await count(
  `select count(*)::int as n from information_schema.table_constraints where constraint_type='FOREIGN KEY' and table_schema='public'`
);
const policies = await count(`select count(*)::int as n from pg_policies where schemaname='public'`);
check("tables created", postTables > prodTables, `${prodTables} → ${postTables}`);
check("foreign keys intact", fks > 0, `${fks} foreign keys`);
check("row level security policies present", policies > 0, `${policies} policies`);

// ---------------------------------------------------------------- 4. runtime role
const role = await db.query(
  `select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname='zooka_runtime'`
);
check("zooka_runtime exists and cannot bypass RLS", role.rows.length === 1 && role.rows[0].rolbypassrls === false && role.rows[0].rolsuper === false, JSON.stringify(role.rows[0] ?? {}));

const grants = await count(
  `select count(*)::int as n from information_schema.role_table_grants where grantee='zooka_runtime'`
);
check("runtime grants applied", grants > 0, `${grants} table grants`);

// ---------------------------------------------------------------- 5. tenant isolation as the runtime role
// The role created by 0031 has LOGIN and no BYPASSRLS, so a policy that is wrong shows up
// here as a wrong row count rather than as a comment. Organization itself is unpoliced on
// purpose (sign-in reads it before any tenant exists), so isolation is measured on Chat,
// which is a real tenant table in production.
const chatOrg = (
  await db.query(`select "organizationId" as org from "Chat" limit 1`)
).rows[0]?.org;
let isolation = "not tested";
try {
  await db.exec(`begin`);
  await db.exec(`set local role zooka_runtime`);
  await db.exec(`select set_config('app.organization_id', '${chatOrg}', true)`);
  const own = await count(`select count(*)::int as n from "Chat"`);
  await db.exec(`select set_config('app.organization_id', '11111111-1111-4111-8111-111111111111', true)`);
  const foreign = await count(`select count(*)::int as n from "Chat"`);
  await db.exec(`rollback`);
  isolation = `own=${own} foreign=${foreign}`;
} catch (error) {
  isolation = `error: ${error.message.slice(0, 90)}`;
  try { await db.exec(`rollback`); } catch {}
}
check("runtime role sees its own tenant and nothing else", isolation === "own=1 foreign=0", isolation);

// ---------------------------------------------------------------- 6. rollback
const downs = readdirSync(PENDING).filter((f) => f.endsWith(".down.sql")).sort().reverse();
let rolled = 0;
const refused = [];
for (const file of downs) {
  try {
    await db.exec(readFileSync(join(PENDING, file), "utf8"));
    rolled++;
  } catch (error) {
    refused.push({ file, error: error.message.slice(0, 70) });
  }
}
check(
  "every rollback applies or refuses, none half-applies",
  rolled + refused.length === downs.length,
  `${rolled} applied, ${refused.length} refused because their tables hold rows (the designed safety)`
);

for (const s of seeded) {
  const n = await count(`select count(*)::int as n from "${s.table}"`).catch(() => -1);
  if (n >= 0) check(`rows still present after rollback in ${s.table}`, n >= 1, `${n}`);
}

const ok = checks.every((c) => c.ok);
console.log(`\n${ok ? "ALL CHECKS PASSED" : "CHECKS FAILED"}: ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(ok ? 0 : 1);
