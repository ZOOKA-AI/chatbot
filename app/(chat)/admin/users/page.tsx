import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getUsers } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "المستخدمون — ZOOKA-AI" };

export default async function UsersPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getUsers(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "المستخدمون" : "Users"}
      description={
        lang === "ar"
          ? "أعضاء مساحة العمل هذه فقط. لا تُقرأ مساحة عمل أخرى من هنا."
          : "Members of this workspace only. No other workspace is read from here."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
