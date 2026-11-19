import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/db/queries";
import { getTrafficSnapshotForOrganization } from "@/lib/analytics/growth";
import { growthNotice } from "@/lib/analytics/growth-notice";
import { readSettings } from "@/lib/growth/referrals";
import { getLang } from "@/lib/i18n";

export default async function GrowthAdminPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (context.role !== "owner") redirect("/workspace");

  const lang = await getLang();
  const ar = lang === "ar";
  const settings = await readSettings();
  // Prefer the workspace's own read-only Google grant; fall back to the
  // deployment service account when the owner has not connected one yet.
  const traffic = await getTrafficSnapshotForOrganization(context.organizationId);
  const notice = growthNotice(traffic, ar);

  let recent: Array<Record<string, unknown>> = [];
  let audit: Array<Record<string, unknown>> = [];
  try {
    recent = (await adminDb().execute(sql`
      SELECT "id"::text AS id, "kind", "points", "status", "createdAt"
      FROM "RewardLedger" ORDER BY "createdAt" DESC LIMIT 20
    `)) as unknown as Array<Record<string, unknown>>;
    audit = (await adminDb().execute(sql`
      SELECT "action", "detail", "createdAt" FROM "GrowthAudit" ORDER BY "createdAt" DESC LIMIT 10
    `)) as unknown as Array<Record<string, unknown>>;
  } catch {
    recent = [];
    audit = [];
  }

  const fields: Array<[string, number]> = [
    ["pointsWelcome", settings.pointsWelcome],
    ["pointsReferrerVerified", settings.pointsReferrerVerified],
    ["pointsReferrerFirstTask", settings.pointsReferrerFirstTask],
    ["pointsFirstTask", settings.pointsFirstTask],
    ["ambassadorThreshold", settings.ambassadorThreshold],
    ["bonusAtTenReferrals", settings.bonusAtTenReferrals],
    ["monthlyBudgetPoints", settings.monthlyBudgetPoints],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <header>
        <h1 className="text-2xl font-semibold">{ar ? "إدارة النمو" : "Growth admin"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ar
            ? "برنامج الإحالة مفتوح. القيم تُطبَّق فورًا على المكافآت الجديدة، وكل تعديل يُسجَّل في سجل غير قابل للتغيير."
            : "Referral program is live. Values apply to new rewards immediately, and every change lands in an append-only audit log."}
        </p>
      </header>

      <form
        action={async (formData: FormData) => {
          "use server";
          const { updateGrowthSettings } = await import("./actions");
          await updateGrowthSettings(formData);
        }}
        className="space-y-3 rounded-2xl border bg-card p-4"
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="programEnabled" defaultChecked={settings.programEnabled} />
          {ar ? "تفعيل برنامج الإحالة" : "Referral program enabled"}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([name, value]) => (
            <label key={name} className="text-xs text-muted-foreground">
              {name}
              <input
                type="number"
                name={name}
                defaultValue={value}
                min={0}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          ))}
        </div>
        <button type="submit" className="rounded-lg bg-[#2E86AB] px-4 py-2 text-sm font-medium text-white">
          {ar ? "حفظ" : "Save"}
        </button>
      </form>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{ar ? "أحدث المكافآت" : "Recent rewards"}</h2>
        <ul className="mt-2 divide-y text-sm">
          {recent.length === 0 ? (
            <li className="py-2 text-muted-foreground">{ar ? "لا سجلات." : "No records."}</li>
          ) : (
            recent.map((row) => (
              <li key={String(row.id)} className="flex items-center justify-between py-2">
                <span>{String(row.kind)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{String(row.status)}</span>
                  <span className="font-semibold">{String(row.points)}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{ar ? "سجل التعديلات" : "Adjustment audit"}</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {audit.length === 0 ? (
            <li>{ar ? "لا تعديلات." : "No adjustments."}</li>
          ) : (
            audit.map((row, i) => (
              <li key={i} className="font-mono">
                {String(row.action)} · {new Date(row.createdAt as string).toISOString()}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {ar ? "حركة الموقع · آخر 28 يومًا" : "Traffic · last 28 days"}
          </h2>
          {traffic.generatedAt ? (
            <span className="text-[10px] text-muted-foreground">
              {new Date(traffic.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {traffic.source === "workspace_oauth" ? (
            <span>
              {ar
                ? "متصل بحساب Google الخاص بك بصلاحية قراءة فقط."
                : "Connected to your own Google account with read-only access."}
            </span>
          ) : (
            <a
              className="rounded-full border px-3 py-1 font-semibold hover:bg-muted"
              href="/api/integrations/google-growth/connect"
            >
              {ar
                ? "اربط Google Analytics وSearch Console"
                : "Connect Google Analytics and Search Console"}
            </a>
          )}
          {traffic.source === "workspace_oauth" ? (
            <a className="underline" href="/api/integrations/google-growth">
              {ar ? "حالة الاتصال" : "Connection status"}
            </a>
          ) : null}
        </div>

        {!traffic.configured ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {ar
              ? "لم تُضبط مصادر الزيارات بعد. المطلوب في متغيّرات البيئة: GOOGLE_GROWTH_SA_JSON وGA4_PROPERTY_ID وGSC_SITE. لا تُعرض أي أرقام قبل ذلك."
              : "Traffic sources are not configured. Required environment: GOOGLE_GROWTH_SA_JSON, GA4_PROPERTY_ID and GSC_SITE. No numbers are shown before that."}
          </p>
        ) : null}

        {traffic.configured && traffic.ga4 ? (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border p-2">
                <div className="text-lg font-semibold">{traffic.ga4.sessions}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "جلسات" : "sessions"}</div>
              </div>
              <div className="rounded-xl border p-2">
                <div className="text-lg font-semibold">{traffic.ga4.users}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "مستخدمون" : "users"}</div>
              </div>
              <div className="rounded-xl border p-2">
                <div className="text-lg font-semibold">{traffic.ga4.views}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "مشاهدات" : "views"}</div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold">{ar ? "القنوات" : "Channels"}</h3>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {traffic.ga4.channels.length === 0 ? (
                    <li>{ar ? "لا بيانات." : "No data."}</li>
                  ) : (
                    traffic.ga4.channels.map((row) => (
                      <li key={row.label} className="flex justify-between gap-2">
                        <span className="truncate font-mono">{row.label}</span>
                        <span className="font-semibold">{row.sessions}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold">{ar ? "أهم الصفحات" : "Top pages"}</h3>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {traffic.ga4.pages.length === 0 ? (
                    <li>{ar ? "لا بيانات." : "No data."}</li>
                  ) : (
                    traffic.ga4.pages.map((row) => (
                      <li key={row.path} className="flex justify-between gap-2">
                        <span className="truncate font-mono">{row.path}</span>
                        <span className="font-semibold">{row.views}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {traffic.ga4 ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {ar
              ? "قد يتجاوز مجموع جلسات القنوات عدد الجلسات الكلي، لأن GA4 قد ينسب الجلسة الواحدة إلى أكثر من قناة."
              : "Channel sessions can add up to more than the total, because GA4 may attribute one session to more than one channel group."}
          </p>
        ) : null}

        {traffic.gsc ? (
          <div className="mt-4 space-y-2 border-t pt-3">
            <h3 className="text-xs font-semibold">{ar ? "بحث Google" : "Google Search"}</h3>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <div className="font-semibold">{traffic.gsc.clicks}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "نقرات" : "clicks"}</div>
              </div>
              <div>
                <div className="font-semibold">{traffic.gsc.impressions}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "ظهور" : "impressions"}</div>
              </div>
              <div>
                <div className="font-semibold">{(traffic.gsc.ctr * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "نسبة النقر" : "CTR"}</div>
              </div>
              <div>
                <div className="font-semibold">{traffic.gsc.position.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">{ar ? "متوسط الترتيب" : "position"}</div>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {traffic.gsc.queries.map((row) => (
                <li key={row.query} className="flex justify-between gap-2">
                  <span className="truncate">{row.query}</span>
                  <span className="font-mono">
                    {row.clicks}/{row.impressions}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notice ? (
          <p
            className={`mt-3 text-[11px] ${
              notice.tone === "failure" ? "text-red-600" : "text-amber-600"
            }`}
            role="status"
          >
            {notice.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
