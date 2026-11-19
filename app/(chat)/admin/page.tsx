import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getCommandOverview } from "@/lib/admin/overview";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "مركز القيادة — ZOOKA AI" };

export default async function AdminOverviewPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;

  const data = await getCommandOverview(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "نظرة شاملة" : "Overview"}
      description={
        lang === "ar"
          ? "المستخدمون، المحادثات، الوكيل، الاستوديو، المتصفح، البريد، والاستخدام — كل رقم من مصدره."
          : "Users, conversations, the agent, studios, browser, mail and usage, each from its own source."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      <div className="grid gap-3 xl:grid-cols-2">
        {data.tables.map((table) => (
          <DataTable key={table.key} table={table} lang={lang} />
        ))}
      </div>
    </SectionView>
  );
}
