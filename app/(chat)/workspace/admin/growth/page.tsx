import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/db/queries";
import { readSettings } from "@/lib/growth/referrals";
import { getLang } from "@/lib/i18n";

export default async function GrowthAdminPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (context.role !== "owner") redirect("/workspace");

  const lang = await getLang();
  const ar = lang === "ar";
  const settings = await readSettings();

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
    </div>
  );
}
