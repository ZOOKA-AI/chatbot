import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import Link from "next/link";

import { getAutomation } from "@/lib/admin/sections";
import { MetricGrid, SectionView } from "@/components/admin/ui";
import type { Metric } from "@/lib/admin/types";

export const metadata = { title: "الأتمتة — ZOOKA AI" };

export default async function AutomationPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const snapshot = await getAutomation(admin.organizationId);
  const lang = admin.lang;

  const probed = snapshot.stage !== "not_configured" && snapshot.stage !== "error";
  const metrics: Metric[] = [
    {
      key: "n8n_workflows",
      labelAr: "سير عمل في n8n",
      labelEn: "n8n workflows",
      value: probed ? snapshot.workflowCount : null,
      state: probed ? (snapshot.workflowCount > 0 ? "ok" : "empty") : "not_configured",
      source: "n8n /api/v1/workflows",
      detail: snapshot.probeError,
    },
    {
      key: "n8n_active",
      labelAr: "سير نشط",
      labelEn: "Active workflows",
      value: probed ? snapshot.activeWorkflowCount : null,
      state: probed ? (snapshot.activeWorkflowCount > 0 ? "ok" : "empty") : "not_configured",
      source: "n8n /api/v1/workflows?active=true",
      detail: snapshot.probeError,
    },
  ];

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الأتمتة" : "Automation"}
      description={
        lang === "ar"
          ? "حالة اتصال n8n كما فُحصت الآن. المرحلة أدناه من الفحص نفسه، لا من إعداد محفوظ."
          : "The n8n connection as probed right now. The stage below comes from that probe, not from stored configuration."
      }
    >
      <MetricGrid metrics={metrics} lang={lang} />
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
        <p>
          {lang === "ar" ? "مرحلة الاتصال: " : "Connection stage: "}
          <span dir="ltr" className="font-mono text-white">
            {snapshot.stage}
          </span>
        </p>
        {snapshot.reasons.length > 0 ? (
          <p dir="ltr" className="mt-1 font-mono text-[11px] text-white/40">
            {snapshot.reasons.join(", ")}
          </p>
        ) : null}
        <Link href="/workspace/admin/n8n" className="mt-2 inline-block text-[#2E86AB] underline">
          {lang === "ar" ? "لوحة n8n التفصيلية" : "Detailed n8n dashboard"}
        </Link>
      </div>
    </SectionView>
  );
}
