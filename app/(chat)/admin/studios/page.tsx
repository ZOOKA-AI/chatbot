import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getStudios } from "@/lib/admin/sections";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "الاستوديوهات — ZOOKA AI" };

export default async function StudiosPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const data = await getStudios(admin.organizationId);
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الاستوديوهات" : "Studios"}
      description={
        lang === "ar"
          ? "مهام الصور والفيديو كما سجّلها المحرك: ناجحة، جارية، أو فاشلة مع سببها."
          : "Image and video jobs as the engine recorded them: succeeded, running, or failed with its reason."
      }
    >
      <MetricGrid metrics={data.metrics} lang={lang} />
      {data.tables.map((table) => (
        <DataTable key={table.key} table={table} lang={lang} />
      ))}
    </SectionView>
  );
}
