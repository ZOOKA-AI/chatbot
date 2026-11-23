import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getBilling } from "@/lib/admin/sections";
import { MetricGrid, SectionView } from "@/components/admin/ui";
import type { Metric } from "@/lib/admin/types";

export const metadata = { title: "الفوترة — ZOOKA-AI" };

export default async function BillingPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const billing = await getBilling(admin.organizationId);
  const lang = admin.lang;

  const metrics: Metric[] = [
    {
      key: "messages_used",
      labelAr: "رسائل مستهلكة",
      labelEn: "Messages used",
      value: billing.messages,
      state: billing.messages > 0 ? "ok" : "empty",
      source: "UsageEvent(chat_message)",
    },
    {
      key: "agent_runs",
      labelAr: "تشغيلات الوكيل",
      labelEn: "Agent runs",
      value: billing.agentRuns,
      state: billing.agentRuns > 0 ? "ok" : "empty",
      source: "UsageEvent(agent_run)",
    },
  ];

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الفوترة والاستخدام" : "Billing & usage"}
      description={
        lang === "ar"
          ? "الخطة والاستخدام من سجل الاشتراك والاستخدام. لا تُنفَّذ أي عملية دفع من هذه اللوحة."
          : "Plan and usage from the subscription and usage records. No payment runs from this panel."
      }
    >
      <MetricGrid metrics={metrics} lang={lang} />
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
        <p dir="ltr" className="font-mono">
          plan={billing.plan} status={billing.status} periodEnd={billing.periodEnd ?? "—"}
        </p>
      </div>
    </SectionView>
  );
}
