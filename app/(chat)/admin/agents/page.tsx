import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getAgents } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "الوكلاء — ZOOKA AI" };

export default async function AgentsPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getAgents(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الوكلاء" : "Agents"}
      description={
        lang === "ar"
          ? "هويات الوكلاء المسجّلة وحالتها، وتنفيذاتها الجارية. القائمة فارغة تعني لا وكيل مسجّل، لا أن الوكيل يعمل."
          : "Registered agent identities and their state, plus running executions. An empty list means no registered agent, not a working one."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
