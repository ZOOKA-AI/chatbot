import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { workspacePlans } from "@/lib/saas/plans";

/** Usage is metered per calendar month in UTC, the same window the quota checks read. */
function currentPeriod() {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function fill(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default async function UsageSettingsPage() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
    redirect("/login");
  }

  const lang = await getLang();
  const ar = lang === "ar";
  const [billing, entitlements] = await Promise.all([
    getWorkspaceBilling(context.organizationId),
    getWorkspaceEntitlements(context.organizationId),
  ]);

  const plan = workspacePlans[entitlements.plan] ?? workspacePlans.free;
  const { start, end } = currentPeriod();
  const status = billing?.subscription?.status ?? "free";

  const rows = [
    {
      key: "messages",
      label: ar ? "رسائل المحادثة" : "Chat messages",
      used: billing?.usage.messages ?? 0,
      limit: plan.monthlyMessages,
    },
    {
      key: "agent",
      label: ar ? "تشغيلات وضع الوكيل" : "Agent runs",
      used: billing?.usage.agentRuns ?? 0,
      limit: plan.monthlyAgentRuns,
    },
    {
      key: "search",
      label: ar ? "عمليات بحث الويب" : "Web searches",
      used: billing?.usage.webSearches ?? 0,
      limit: plan.monthlyWebSearches,
    },
  ];

  const dateFormat = new Intl.DateTimeFormat(ar ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const numberFormat = (value: number) =>
    value.toLocaleString(ar ? "ar-AE" : "en-US");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">
          {ar ? "الاستخدام والحدود" : "Usage and limits"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar
            ? `باقتك الحالية ${plan.name}، والعدّاد يتصفّر أول كل شهر ميلادي بتوقيت UTC.`
            : `You are on the ${plan.name} plan. Counters reset on the first of each month, UTC.`}
        </p>
      </header>

      <section className="rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {ar ? "الباقة" : "Plan"}
            </p>
            <p className="font-semibold text-xl">{plan.name}</p>
          </div>
          <div className="text-end">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {ar ? "حالة الاشتراك" : "Subscription"}
            </p>
            <p className="font-medium text-sm">{status}</p>
          </div>
          <div className="text-end">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {ar ? "الفترة الحالية" : "Current period"}
            </p>
            <p className="font-medium text-sm">
              {dateFormat.format(start)} —{" "}
              {dateFormat.format(new Date(end.getTime() - 1))}
            </p>
          </div>
        </div>
        {entitlements.isPaid ? null : (
          <p className="mt-4 text-muted-foreground text-sm">
            {ar
              ? "الخطة المجانية لا تتضمن ربط أدوات ولا وضع الوكيل. الترقية تفتح الاثنين فورًا."
              : "Free does not include tool connections or agent mode. Upgrading unlocks both immediately."}
            <Link className="ms-2 underline" href="/pricing">
              {ar ? "عرض الباقات" : "See plans"}
            </Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-5">
        {rows.map((row) => {
          const included = row.limit > 0;
          const remaining = Math.max(0, row.limit - row.used);
          const tight = included && remaining <= Math.max(1, row.limit * 0.1);
          return (
            <div className="rounded-lg border p-5" key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{row.label}</p>
                <p className="text-muted-foreground text-sm">
                  {included
                    ? `${numberFormat(row.used)} / ${numberFormat(row.limit)}`
                    : numberFormat(row.used)}
                </p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${tight ? "bg-amber-500" : "bg-blue-500"}`}
                  style={{ width: `${included ? fill(row.used, row.limit) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {included
                  ? ar
                    ? `المتبقي ${numberFormat(remaining)}`
                    : `${numberFormat(remaining)} left`
                  : ar
                    ? "غير متاح في باقتك"
                    : "Not included in your plan"}
              </p>
            </div>
          );
        })}
      </section>

      <p className="text-muted-foreground text-xs">
        {ar
          ? "الأرقام تُقرأ من سجل الاستخدام الفعلي لهذه المساحة، وليست تقديرية."
          : "These numbers come from this workspace's real usage log, not an estimate."}
      </p>
    </main>
  );
}
