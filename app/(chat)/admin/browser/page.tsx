import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { LiveBrowser } from "@/components/live-browser";
import { getBrowserSessions } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "المتصفح — ZOOKA-AI" };

export default async function AdminBrowserPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getBrowserSessions(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "المتصفح" : "Browser"}
      description={
        lang === "ar"
          ? "عرض مباشر داخل لوحة القيادة، وجلسات الوكيل المسجّلة. الموقع الذي يمنع الإطار يُفتح في متصفح الوكيل من الخادم."
          : "A live view inside the command center, plus the recorded agent sessions. A site that refuses framing opens in the server-side agent browser."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      <div className="h-[70vh]">
        <LiveBrowser fillHeight />
      </div>
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
