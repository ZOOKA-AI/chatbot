import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getCommandOverview } from "@/lib/admin/overview";
import { StatePill } from "@/components/admin/ui";
import { SectionView } from "@/components/admin/ui";
import type { MetricState } from "@/lib/admin/types";

export const metadata = { title: "خريطة النظام — ZOOKA-AI" };

type Node = { key: string; labelAr: string; labelEn: string; metricKey: string; children?: string[] };

const NODES: Node[] = [
  { key: "users", labelAr: "المستخدمون", labelEn: "Users", metricKey: "members" },
  { key: "workspaces", labelAr: "مساحات العمل", labelEn: "Workspaces", metricKey: "members" },
  { key: "chats", labelAr: "المحادثات", labelEn: "Conversations", metricKey: "chats" },
  { key: "messages", labelAr: "الرسائل", labelEn: "Messages", metricKey: "messages" },
  { key: "agent", labelAr: "الوكيل", labelEn: "Agent", metricKey: "executions" },
  { key: "tasks", labelAr: "مهام التطوير", labelEn: "Development tasks", metricKey: "agent_tasks" },
  { key: "studios", labelAr: "الاستوديوهات", labelEn: "Studios", metricKey: "media_jobs" },
  { key: "browser", labelAr: "المتصفح", labelEn: "Browser", metricKey: "browser_sessions" },
  { key: "mail", labelAr: "البريد", labelEn: "Mail", metricKey: "mail_messages" },
  { key: "usage", labelAr: "الاستخدام", labelEn: "Usage", metricKey: "usage_events" },
  { key: "approvals", labelAr: "الموافقات", labelEn: "Approvals", metricKey: "approvals_pending" },
];

/**
 * The map is the same evidence as the overview, arranged as a path.
 *
 * Each node borrows the state of the metric behind it, so the map cannot show a healthy system while
 * the numbers say otherwise, and a node whose source is missing shows "not configured" rather than green.
 */
export default async function SystemMapPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const lang = admin.lang;
  const overview = await getCommandOverview(admin.organizationId);

  const stateOf = (metricKey: string): { state: MetricState; value: number | null } => {
    const metric = overview.metrics.find((item) => item.key === metricKey);
    return { state: metric?.state ?? "not_configured", value: metric?.value ?? null };
  };

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "خريطة النظام" : "System map"}
      description={
        lang === "ar"
          ? "كل عقدة تحمل حالة مصدرها الحقيقي: مقروءة، فارغة، غير مهيّأة، أو فشل قراءة."
          : "Each node carries the state of its real source: read, empty, not configured, or read failed."
      }
    >
      <ol className="space-y-2">
        {NODES.map((node, index) => {
          const { state, value } = stateOf(node.metricKey);
          return (
            <li key={node.key} className="flex items-center gap-3">
              <span className="w-6 text-center font-mono text-[10px] text-white/30">{index + 1}</span>
              <div className="flex flex-1 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div>
                  <p className="text-sm text-white">{lang === "ar" ? node.labelAr : node.labelEn}</p>
                  <p dir="ltr" className="font-mono text-[10px] text-white/30">
                    {node.metricKey}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-sm text-white/80">{value === null ? "—" : value}</span>
                  <StatePill state={state} lang={lang} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-white/50">
        {lang === "ar"
          ? "المسار بعد المراقبة (تشخيص ← إصلاح ← اختبار ← معاينة ← موافقة ← نشر ← تحقق) يظهر في قسمي الأعطال والتطوير، لأن كل خطوة منه صف حقيقي في القاعدة."
          : "The post-detection path (diagnose → repair → test → preview → approval → deploy → verify) lives in the Incidents and Development sections, because every step there is a real row."}
      </p>
    </SectionView>
  );
}
