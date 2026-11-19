import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getDevelopment } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "التطوير — ZOOKA AI" };

export default async function DevelopmentPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getDevelopment(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "مركز التطوير والإصلاح" : "Development & repair"}
      description={
        lang === "ar"
          ? "المهام المقترحة والمنفّذة، وكل ما ينتظر موافقتك قبل أي دمج أو نشر."
          : "Proposed and executed tasks, and everything waiting for your approval before any merge or release."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
