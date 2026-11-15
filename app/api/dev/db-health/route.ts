import { NextResponse } from "next/server";
import postgres from "postgres";

/**
 * مسار صحة قاعدة التطوير — للمعاينة فقط.
 * لا يعمل في الإنتاج أبدًا، ولا يكشف أي سر: يرجّع فقط الهوست والتأخير وعدد الجداول.
 * الحماية: VERCEL_ENV === "preview" + ترويسة x-dev-health-token تطابق DEV_HEALTH_TOKEN.
 */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, reason: "preview_only" }, { status: 404 });
  }
  const token = request.headers.get("x-dev-health-token");
  const expected = process.env.DEV_HEALTH_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const url = process.env.DEV_DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, reason: "dev_database_url_missing" }, { status: 503 });
  }
  if (url.includes("krzfrsaquvmwctsajhlm") || url.includes("bylfizytgayoefuyliix")) {
    return NextResponse.json({ ok: false, reason: "production_refused" }, { status: 400 });
  }

  const started = Date.now();
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'`;
    const agent = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_class
      where relnamespace='public'::regnamespace and relrowsecurity
        and relname in ('AgentRun','AgentStep','AgentApproval','AgentPolicy','IntegrationConnection','IntegrationEvent','AdAccount','Campaign','CampaignChange','SpendLedger','AuditLog')`;
    return NextResponse.json({
      ok: true,
      host: new URL(url).host,
      latencyMs: Date.now() - started,
      tables: rows[0]?.n ?? 0,
      agentTablesWithRls: agent[0]?.n ?? 0,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: "connection_failed",
      message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    }, { status: 502 });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
