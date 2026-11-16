import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getTestingAccessRoster } from "@/lib/db/queries";
import {
  OWNER_TESTING_EMAILS,
  unlimitedTestingModeFlag,
  isTestingAccessEmail,
  isUnlimitedTestingEnabled,
} from "@/lib/billing/testing-access";

/**
 * Owner-only view of testing access.
 *
 * Read-only by design: the grant is an email allowlist plus a deployment flag,
 * so there is nothing to mutate in the database here. Turning the feature off
 * is a one-variable change (UNLIMITED_TESTING_MODE) and never touches customer
 * subscriptions or usage history.
 */
export default async function TestingAccessPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }
  if (context.role !== "owner" || !isTestingAccessEmail(context.user.email)) {
    redirect("/workspace");
  }

  const rows = await getTestingAccessRoster(OWNER_TESTING_EMAILS);
  const enabled = isUnlimitedTestingEnabled();
  const found = rows.filter((row) => row.userId);
  const missing = rows.filter((row) => !row.userId);
  const paid = rows.filter((row) => row.plan && row.plan !== "free");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6" dir="rtl">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">وصول الاختبار للمالك</h1>
        <p className="text-sm text-muted-foreground">
          الاختبار غير المحدود يُفعّل بحسابات محددة بالبريد فقط. الاشتراكات والاستخدام
          يبقيان مسجلين كما هما، ولا تُخصم أرصدة مدفوعة.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs uppercase text-muted-foreground">المفتاح العام</div>
          <div className="mt-1 text-lg font-semibold">
            {enabled ? "مُفعّل" : "مُعطّل"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {unlimitedTestingModeFlag}={enabled ? "on" : "off"}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs uppercase text-muted-foreground">حسابات مسجلة</div>
          <div className="mt-1 text-lg font-semibold">{found.length} / {rows.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">{missing.length} بانتظار التسجيل</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs uppercase text-muted-foreground">اشتراكات مدفوعة محفوظة</div>
          <div className="mt-1 text-lg font-semibold">{paid.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">لم تُعدّل بأي حال</div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 font-medium">البريد</th>
              <th className="p-3 font-medium">المساحة</th>
              <th className="p-3 font-medium">الخطة</th>
              <th className="p-3 font-medium">الاستخدام</th>
              <th className="p-3 font-medium">آخر نشاط</th>
              <th className="p-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.email} className="border-t">
                <td className="p-3 font-mono text-xs">{row.email}</td>
                <td className="p-3">{row.organizationName ?? "—"}</td>
                <td className="p-3">
                  {row.plan ? `${row.plan} / ${row.status ?? "-"}` : "—"}
                </td>
                <td className="p-3">{row.usageEvents}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {row.lastActivity ? new Date(row.lastActivity).toISOString().slice(0, 16).replace("T", " ") : "—"}
                </td>
                <td className="p-3">
                  {row.userId ? (
                    enabled ? "اختبار غير محدود" : "مسجل (المفتاح مغلق)"
                  ) : (
                    "بانتظار التسجيل"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border p-4 text-sm">
        <h2 className="font-medium">حدود هذا التفعيل</h2>
        <ul className="mt-2 list-disc space-y-1 pr-5 text-muted-foreground">
          <li>لا يمنح صلاحيات مدير عام ولا صلاحيات على قاعدة البيانات.</li>
          <li>لا يلغي العزل بين المستأجرين ولا RLS ولا تفويض الأدوات.</li>
          <li>الاستخدام يُحتسب ويُسجّل، والتكلفة الفعلية تبقى مرئية.</li>
          <li>الإلغاء يتم بإيقاف المتغير أعلاه، ويحفظ الاشتراكات وسجل الاستخدام.</li>
        </ul>
      </section>
    </div>
  );
}
