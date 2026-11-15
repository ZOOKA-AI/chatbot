#!/usr/bin/env node
/**
 * تحقق فعلي من قاعدة التطوير: RLS، الصلاحيات، القراءة/الكتابة، سجل التدقيق غير القابل للتعديل.
 * يشغّل فقط على DEV_DATABASE_URL ويرفض مشاريع الإنتاج.
 */
import postgres from "postgres";

const url = process.env.DEV_DATABASE_URL;
for (const bad of ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"]) {
  if (!url || url.includes(bad)) { console.error("✖ DEV_DATABASE_URL مطلوب ولا يجوز أن يشير للإنتاج"); process.exit(2); }
}

const AGENT_TABLES = ["AgentRun","AgentStep","AgentApproval","AgentPolicy","IntegrationConnection","IntegrationEvent","AdAccount","Campaign","CampaignChange","SpendLedger","AuditLog"];
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass, detail }); };

async function main() {
  // 1) الاتصال والإصدار
  const [{ version }] = await sql`select version() as version`;
  const host = new URL(url).host;
  check("connection", true, `${host} · ${String(version).split(",")[0]}`);

  // 2) RLS مفعّل على الجداول الجديدة
  const rls = await sql`select relname from pg_class where relnamespace='public'::regnamespace
    and relname in ${sql(AGENT_TABLES)} and relrowsecurity`;
  check("rls_enabled", rls.length === AGENT_TABLES.length, `${rls.length}/${AGENT_TABLES.length}`);

  // 3) لا صلاحيات لـanon/authenticated
  const grants = await sql`select count(*)::int as n from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated') and table_name in ${sql(AGENT_TABLES)}`;
  check("no_anon_grants", grants[0].n === 0, `grants=${grants[0].n}`);

  // 4) قراءة/كتابة فعليّة (المالك)
  const org = "99999999-9999-4999-8999-999999999999";
  const [run] = await sql`insert into "AgentRun" ("organizationId","agentKey") values (${org},'master') returning id`;
  await sql`insert into "AgentStep" ("runId",seq,"toolKey") values (${run.id},1,'web.search')`;
  const [read] = await sql`select count(*)::int as n from "AgentStep" where "runId"=${run.id}`;
  check("read_write", read.n === 1, `steps=${read.n}`);

  // 5) AuditLog: إضافة مسموحة، تعديل وحذف ممنوعان
  await sql`insert into "AuditLog" (actor, action) values ('system','dev.selfcheck')`;
  let upd = false, del = false;
  try { await sql`update "AuditLog" set action='tampered'`; } catch (e) { upd = /append-only/i.test(String(e.message)); }
  try { await sql`delete from "AuditLog"`; } catch (e) { del = /append-only/i.test(String(e.message)); }
  check("audit_append_only", upd && del, `update_blocked=${upd} delete_blocked=${del}`);

  // 6) قيد التفرد في AgentPolicy
  await sql`insert into "AgentPolicy" ("organizationId","agentKey") values (${org},'master')`;
  let dup = false;
  try { await sql`insert into "AgentPolicy" ("organizationId","agentKey") values (${org},'master')`; } catch { dup = true; }
  check("policy_unique", dup, "منع تكرار الوكيل لنفس المنظمة");

  // 7) تنظيف بيانات الاختبار
  await sql`delete from "AgentRun" where "organizationId"=${org}`;
  await sql`delete from "AgentPolicy" where "organizationId"=${org}`;

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}
main().catch((e) => { console.error("✖", e.message); process.exitCode = 1; }).finally(() => sql.end());
