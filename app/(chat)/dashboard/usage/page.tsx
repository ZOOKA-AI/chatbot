import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling, getWorkspaceUsageDetail } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n";

const EVENT_LABELS: Record<string, { ar: string; en: string }> = {
  chat_message: { ar: "رسائل المحادثة", en: "Chat messages" },
  agent_run: { ar: "تشغيلات الوكيل", en: "Agent runs" },
  web_search: { ar: "عمليات بحث الويب", en: "Web searches" },
};

function label(event: string, lang: "ar" | "en") {
  return EVENT_LABELS[event]?.[lang] ?? event;
}

export default async function UsageReportPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const isArabic = lang === "ar";
  const [billing, detail] = await Promise.all([
    getWorkspaceBilling(context.organizationId),
    getWorkspaceUsageDetail(context.organizationId),
  ]);

  const plan = billing.subscription?.plan ?? "free";
  const status = billing.subscription?.status ?? "none";
  const periodEnd = billing.subscription?.periodEnd;
  const formatter = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  });

  const cards = [
    {
      label: isArabic ? "رسائل المحادثة" : "Chat messages",
      value: billing.usage.messages,
    },
    {
      label: isArabic ? "تشغيلات الوكيل" : "Agent runs",
      value: billing.usage.agentRuns,
    },
    {
      label: isArabic ? "عمليات بحث الويب" : "Web searches",
      value: billing.usage.webSearches,
    },
  ];

  return (
    <main
      className="mx-auto w-full max-w-4xl px-4 py-8"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">
            {isArabic ? "تقرير الاستخدام الشهري" : "Monthly usage report"}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {isArabic
              ? "أرقام مقروءة مباشرة من سجلات الاستخدام والاشتراك الفعلية، بلا تقديرات."
              : "Numbers read directly from the recorded usage and subscription rows, no estimates."}
          </p>
        </div>
        <Link
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted/60"
          href="/workspace/billing"
        >
          {isArabic ? "الباقة والفوترة" : "Plan and billing"}
        </Link>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">
            {isArabic ? "الباقة الحالية" : "Current plan"}
          </p>
          <p className="mt-1 font-semibold text-lg uppercase">{plan}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">
            {isArabic ? "حالة الاشتراك" : "Subscription status"}
          </p>
          <p className="mt-1 font-semibold text-lg">{status}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">
            {isArabic ? "نهاية الدورة الحالية" : "Current period ends"}
          </p>
          <p className="mt-1 font-semibold text-sm">
            {periodEnd ? formatter.format(periodEnd) : isArabic ? "غير محدد" : "Not set"}
          </p>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div className="rounded-xl border bg-muted/30 p-4" key={card.label}>
            <p className="text-muted-foreground text-xs">{card.label}</p>
            <p className="mt-1 font-bold text-2xl tabular-nums">
              {card.value.toLocaleString(isArabic ? "ar-AE" : "en-GB")}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-medium">
          {isArabic ? "توزيع الاستخدام هذا الشهر" : "Usage breakdown this month"}
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="p-3 text-start">{isArabic ? "النوع" : "Type"}</th>
                <th className="p-3 text-start">{isArabic ? "الكمية" : "Quantity"}</th>
                <th className="p-3 text-start">{isArabic ? "عدد الأحداث" : "Entries"}</th>
              </tr>
            </thead>
            <tbody>
              {detail.breakdown.length > 0 ? (
                detail.breakdown.map((row) => (
                  <tr className="border-t" key={row.event}>
                    <td className="p-3">{label(row.event, lang)}</td>
                    <td className="p-3 tabular-nums">{row.total.toLocaleString()}</td>
                    <td className="p-3 tabular-nums">{row.entries}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={3}>
                    {isArabic
                      ? "لا توجد أحداث مسجلة هذا الشهر بعد."
                      : "No recorded events this month yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">
          {isArabic ? "آخر الأحداث" : "Recent events"}
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="p-3 text-start">{isArabic ? "الحدث" : "Event"}</th>
                <th className="p-3 text-start">{isArabic ? "الكمية" : "Quantity"}</th>
                <th className="p-3 text-start">{isArabic ? "الوقت" : "Time"}</th>
              </tr>
            </thead>
            <tbody>
              {detail.recent.length > 0 ? (
                detail.recent.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="p-3">{label(row.event, lang)}</td>
                    <td className="p-3 tabular-nums">{row.quantity}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatter.format(row.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={3}>
                    {isArabic ? "لا توجد أحداث بعد." : "No events yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-muted-foreground text-xs">
        {isArabic
          ? "المصدر: جدول UsageEvent وجدول Subscription في قاعدة المشروع، محدثان لحظة فتح الصفحة. لا يحتفظ الجدول بتكلفة الدولار، لذا لا تُعرض تقديرات مالية."
          : "Source: the project's UsageEvent and Subscription tables, read at page load. The table does not store dollar cost, so no monetary estimates are shown."}
      </p>
    </main>
  );
}
