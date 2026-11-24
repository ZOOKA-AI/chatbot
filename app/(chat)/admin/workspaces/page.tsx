import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getWorkspaces } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "مساحات العمل — ZOOKA-AI" };

export default async function WorkspacesPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getWorkspaces(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "مساحات العمل" : "Workspaces"}
      description={
        lang === "ar"
          ? "المساحات المسجّلة في القاعدة، والحالية محدّدة بعلامة."
          : "Workspaces recorded in the database, with the current one marked."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
