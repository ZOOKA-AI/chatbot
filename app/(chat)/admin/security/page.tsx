import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getBrowserSessions, getDevelopment } from "@/lib/admin/sections";
import { getCommandOverview } from "@/lib/admin/overview";
import { MetricGrid, SectionView } from "@/components/admin/ui";
import type { Metric } from "@/lib/admin/types";

export const metadata = { title: "الأمان — ZOOKA AI" };

/**
 * Security shows only what the running app can prove about itself.
 *
 * Repository scanning, secret scanning and dependency alerts live in GitHub, not in this database, so
 * they are reported as not configured here rather than guessed. Saying "no findings" without reading a
 * scanner would be the one lie this page must never tell.
 */
export default async function SecurityPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const lang = admin.lang;

  const [overview, development, browser] = await Promise.all([
    getCommandOverview(admin.organizationId),
    getDevelopment(admin.organizationId),
    getBrowserSessions(admin.organizationId),
  ]);

  const pick = (metrics: Metric[], key: string) => metrics.find((metric) => metric.key === key);
  const failed = pick(overview.metrics, "executions_failed");
  const approvals = pick(development.metrics, "approvals_waiting");
  const browserErrors = pick(browser.metrics, "browser_errors");

  const metrics: Metric[] = [
    failed ?? {
      key: "executions_failed",
      labelAr: "تنفيذات فاشلة",
      labelEn: "Failed executions",
      value: null,
      state: "not_configured",
      source: "AgentExecution",
    },
    approvals ?? {
      key: "approvals_waiting",
      labelAr: "بانتظار موافقتك",
      labelEn: "Awaiting your approval",
      value: null,
      state: "not_configured",
      source: "AgentApproval",
    },
    browserErrors ?? {
      key: "browser_errors",
      labelAr: "جلسات متصفح بأخطاء",
      labelEn: "Browser sessions with errors",
      value: null,
      state: "not_configured",
      source: "BrowserSession",
    },
    {
      key: "repo_scanning",
      labelAr: "فحص المستودع والأسرار",
      labelEn: "Repository & secret scanning",
      value: null,
      state: "not_configured",
      source: "GitHub code scanning (خارج التطبيق)",
      detail: "تُقرأ من GitHub مباشرة، لا من قاعدة التطبيق",
    },
  ];

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الأمان" : "Security"}
      description={
        lang === "ar"
          ? "ما يستطيع التطبيق إثباته عن نفسه: تنفيذات فاشلة، موافقات معلّقة، وجلسات متصفح بأخطاء. ما لا يُقرأ من هنا يُعلن أنه غير مهيّأ."
          : "What the app can prove about itself: failed executions, pending approvals, browser sessions with errors. Anything not readable from here is declared not configured."
      }
    >
      <MetricGrid metrics={metrics} lang={lang} />
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
        <p className="font-medium text-white/80">
          {lang === "ar" ? "ضوابط ثابتة في هذه اللوحة" : "Controls fixed in this panel"}
        </p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>{lang === "ar" ? "الوصول مرفوض افتراضيًا: بلا جلسة → تسجيل الدخول، ودون دور أدمن → منع." : "Fail-closed access: no session goes to login, any role below admin is refused."}</li>
          <li>{lang === "ar" ? "كل قراءة مقيّدة بمساحة العمل الحالية." : "Every read is scoped to the current workspace."}</li>
          <li>{lang === "ar" ? "لا دفع، ولا تغيير قاعدة إنتاج، ولا نشر من هذه اللوحة." : "No payment, no production database change, no release from this panel."}</li>
        </ul>
      </div>
    </SectionView>
  );
}
