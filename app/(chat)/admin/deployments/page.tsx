import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getDeployments } from "@/lib/admin/overview";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "النشر — ZOOKA-AI" };

export default async function DeploymentsPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getDeployments(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "النشر" : "Deployments"}
      description={
        lang === "ar"
          ? "ما سجّلته المنصة من نشرات. حالة Vercel الحيّة تُقرأ من لوحة Vercel نفسها، ولا تُخترع هنا."
          : "What the platform recorded. Live Vercel state is read from Vercel itself and is not invented here."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
