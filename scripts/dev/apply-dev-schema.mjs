#!/usr/bin/env node
/**
 * تطبيق مخطط ZOOKA-AI على قاعدة التطوير فقط.
 * - يقرأ DEV_DATABASE_URL (ممنوع DATABASE_URL/POSTGRES_URL)
 * - يرفض أي عنوان يشير إلى مشروع الإنتاج krzfrsaquvmwctsajhlm
 * - يطبّق هجرات lib/db/migrations ثم هجرة نواة الوكيل lib/db/migrations/dev/0021_p0_agent_core.sql
 * - يتحقق في النهاية من عدد الجداول ووجود 11 جدولًا جديدًا
 * التشغيل: DEV_DATABASE_URL=postgres://... node scripts/dev/apply-dev-schema.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DEV_DATABASE_URL;
const FORBIDDEN = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];

if (!url) {
  console.error("✖ DEV_DATABASE_URL غير معرّف. لا تستخدم DATABASE_URL هنا.");
  process.exit(2);
}
for (const bad of FORBIDDEN) {
  if (url.includes(bad)) {
    console.error(`✖ العنوان يشير إلى مشروع محظور (${bad}). أُلغي التنفيذ.`);
    process.exit(3);
  }
}
if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  console.error("✖ هذا السكربت للتطوير فقط. لن يعمل في بيئة إنتاج.");
  process.exit(4);
}

const AGENT_TABLES = [
  "AgentRun", "AgentStep", "AgentApproval", "AgentPolicy", "IntegrationConnection",
  "IntegrationEvent", "AdAccount", "Campaign", "CampaignChange", "SpendLedger", "AuditLog",
];

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });

function orderFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function main() {
  const base = path.join(process.cwd(), "lib/db/migrations");
  const files = orderFiles(base).map((f) => path.join(base, f));
  const devDir = path.join(base, "dev");
  const devFiles = orderFiles(devDir).map((f) => path.join(devDir, f));
  const all = [...files, ...devFiles];

  const applied = [];
  const skipped = [];
  for (const file of all) {
    const name = path.relative(process.cwd(), file);
    const body = readFileSync(file, "utf8");
    try {
      await sql.unsafe(body);
      applied.push(name);
    } catch (err) {
      const msg = String(err?.message ?? err);
      // الهجرات القديمة 0000-0013 قد تفشل عند الإعادة (types موجودة). نسجّل ونكمل.
      skipped.push({ name, reason: msg.slice(0, 160) });
    }
  }

  const [{ count }] = await sql`select count(*)::int as count from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`;
  const present = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ${sql(AGENT_TABLES)}`;
  const presentNames = present.map((r) => r.table_name);

  console.log(`applied: ${applied.length} | skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  ⚠ ${s.name}: ${s.reason}`);
  console.log(`tables in public: ${count}`);
  console.log(`agent-core tables: ${presentNames.length}/${AGENT_TABLES.length}`);

  if (presentNames.length !== AGENT_TABLES.length) {
    const missing = AGENT_TABLES.filter((t) => !presentNames.includes(t));
    console.error(`✖ جداول ناقصة: ${missing.join(", ")}`);
    process.exitCode = 5;
  }
}

main()
  .catch((e) => { console.error("✖ فشل التطبيق:", e.message); process.exitCode = 1; })
  .finally(() => sql.end());
