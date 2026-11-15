import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SQL = readFileSync("lib/db/migrations/dev/0021_p0_agent_core.sql", "utf8");
const TABLES = [
  "AgentRun", "AgentStep", "AgentApproval", "AgentPolicy", "IntegrationConnection",
  "IntegrationEvent", "AdAccount", "Campaign", "CampaignChange", "SpendLedger", "AuditLog",
];

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL);
}, 120_000);
afterAll(async () => { await db.close(); });

describe("P0 schema on real Postgres (pglite)", () => {
  it("ينشئ الجداول الأحد عشر", async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema='public' and table_name = any($1)`,
      [TABLES],
    );
    expect(r.rows[0].n).toBe(TABLES.length);
  });

  it("RLS مفعّل على كل الجداول", async () => {
    const r = await db.query<{ relname: string }>(
      `select relname from pg_class where relnamespace='public'::regnamespace and relname = any($1) and relrowsecurity`,
      [TABLES],
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...TABLES].sort());
  });

  it("anon وauthenticated بلا أي صلاحية على الجداول", async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
        where table_schema='public' and grantee in ('anon','authenticated') and table_name = any($1)`,
      [TABLES],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("AuditLog يقبل الإضافة ويرفض التعديل", async () => {
    await db.exec(`insert into "AuditLog"(actor, action) values ('owner','p0.test')`);
    await expect(db.exec(`update "AuditLog" set action='tampered'`)).rejects.toThrow(/append-only/i);
  });

  it("AuditLog يرفض الحذف", async () => {
    await expect(db.exec(`delete from "AuditLog"`)).rejects.toThrow(/append-only/i);
  });

  it("AgentStep يمنع تكرار (runId, seq)", async () => {
    const org = "22222222-2222-2222-2222-222222222222";
    const run = await db.query<{ id: string }>(
      `insert into "AgentRun"("organizationId","agentKey") values ($1,'master') returning id`, [org]);
    const runId = run.rows[0].id;
    await db.exec(`insert into "AgentStep"("runId",seq,"toolKey") values ('${runId}',1,'web.search')`);
    await expect(db.exec(`insert into "AgentStep"("runId",seq,"toolKey") values ('${runId}',1,'web.search')`)).rejects.toThrow(/duplicate|unique/i);
  });

  it("حذف التشغيل يحذف خطواته (cascade)", async () => {
    const org = "33333333-3333-3333-3333-333333333333";
    const run = await db.query<{ id: string }>(`insert into "AgentRun"("organizationId","agentKey") values ($1,'master') returning id`, [org]);
    const id = run.rows[0].id;
    await db.exec(`insert into "AgentStep"("runId",seq,"toolKey") values ('${id}',1,'web.fetch')`);
    await db.exec(`delete from "AgentRun" where id='${id}'`);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from "AgentStep" where "runId"='${id}'`);
    expect(n.rows[0].n).toBe(0);
  });

  it("AgentPolicy يفرض وكيلًا واحدًا لكل منظمة", async () => {
    const org = "44444444-4444-4444-4444-444444444444";
    await db.exec(`insert into "AgentPolicy"("organizationId","agentKey") values ('${org}','master')`);
    await expect(db.exec(`insert into "AgentPolicy"("organizationId","agentKey") values ('${org}','master')`)).rejects.toThrow(/duplicate|unique/i);
  });

  it("إعادة تطبيق الترحيل آمنة (idempotent)", async () => {
    await db.exec(SQL);
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname = any($1)`, [TABLES]);
    expect(r.rows[0].n).toBe(TABLES.length);
  }, 120_000);
});
