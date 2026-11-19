import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getIntegrations } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "التكاملات — ZOOKA AI" };

export default async function IntegrationsPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getIntegrations(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "التكاملات" : "Integrations"}
      description={
        lang === "ar"
          ? "الحالة الحقيقية لكل مزوّد كما هي مخزّنة: متصل، منقطع، أو به خطأ — لا «متصل» لأن الإعداد موجود فقط."
          : "Each provider's real stored state: connected, disconnected or errored. Never connected merely because configuration exists."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
