import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getIncidents } from "@/lib/admin/overview";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "الأعطال والإصلاح — ZOOKA-AI" };

export default async function IncidentsPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getIncidents(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الأعطال والإصلاح" : "Incidents & repair"}
      description={
        lang === "ar"
          ? "كل عطل يمر بدورة: جديد ← تشخيص ← إصلاح ← اختبار ← معاينة ← موافقتك ← نشر ← تحقق. الجدول أدناه هو سجل المهام الفعلي."
          : "Every incident follows NEW → DIAGNOSE → FIX → TEST → PREVIEW → your approval → DEPLOY → VERIFY. The table below is the real task log."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
