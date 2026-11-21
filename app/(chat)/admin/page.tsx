import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getCommandOverview } from "@/lib/admin/overview";
import { getPlatformOverview } from "@/lib/admin/platform-overview";
import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";

export const metadata = { title: "مركز القيادة — ZOOKA AI" };

export default async function AdminOverviewPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;

  // Sequential on purpose, matching every other section of this panel. The overview is the only
  // page that loads two aggregate models, and running them concurrently against the service pool
  // left the page pending indefinitely in production (reproduced across sessions while the six
  // other sections rendered in seconds). One after the other costs a round trip and always returns.
  const platform = await getPlatformOverview(admin.platformRole);
  const workspace = await getCommandOverview(admin.organizationId);
  const lang = admin.lang;

  return (
    <div className="flex flex-col gap-8">
      <SectionView
        lang={lang}
        title={lang === "ar" ? "المنصة كاملة" : "Whole platform"}
        description={
          lang === "ar"
            ? "أرقام مجمّعة عبر كل مساحات العمل، كل رقم من مصدره. لا يُعرض محتوى أي مستخدم."
            : "Aggregates across every workspace, each from its own source. No user content is shown."
        }
      >
        <MetricGrid metrics={platform.metrics} lang={lang} />
        <div className="grid gap-3 xl:grid-cols-2">
          {platform.tables.map((table) => (
            <DataTable key={table.key} table={table} lang={lang} />
          ))}
        </div>
      </SectionView>

      <SectionView
        lang={lang}
        title={lang === "ar" ? "مساحة عملك فقط" : "Your workspace only"}
        description={
          lang === "ar"
            ? "الأقسام أدناه وصفحات القائمة الأخرى ما زالت محصورة في مساحة عملك أنت، لا المنصة."
            : "This block and the other sections in the menu are still scoped to your own workspace, not the platform."
        }
      >
        <MetricGrid metrics={workspace.metrics} lang={lang} />
        <div className="grid gap-3 xl:grid-cols-2">
          {workspace.tables.map((table) => (
            <DataTable key={table.key} table={table} lang={lang} />
          ))}
        </div>
      </SectionView>
    </div>
  );
}
