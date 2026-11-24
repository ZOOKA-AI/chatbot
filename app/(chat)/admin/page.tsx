import { Suspense } from "react";

import { DataTable, MetricGrid, SectionView } from "@/components/admin/ui";
import { getCommandOverview } from "@/lib/admin/overview";
import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { getPlatformOverview } from "@/lib/admin/platform-overview";
import type { AdminSection } from "@/lib/admin/types";
import type { Lang } from "@/lib/i18n";

import { OverviewSkeleton } from "./overview-skeleton";

export const metadata = { title: "مركز القيادة — ZOOKA-AI" };

const OVERVIEW_TIMEOUT_MS = 8000;

async function loadOverview(load: () => Promise<AdminSection>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), OVERVIEW_TIMEOUT_MS);
      }),
      load(),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function OverviewContent({ lang, load }: { lang: Lang; load: () => Promise<AdminSection> }) {
  const overview = await loadOverview(load);
  if (!overview) {
    return (
      <div role="status" className="rounded-xl border border-white/10 p-4 text-sm text-white/80">
        {lang === "ar" ? "هذا القسم غير متاح الآن." : "This section is unavailable right now."}{" "}
        <a className="font-medium underline" href="/admin">
          {lang === "ar" ? "إعادة المحاولة" : "Retry"}
        </a>
      </div>
    );
  }

  return (
    <>
      <MetricGrid metrics={overview.metrics} lang={lang} />
      <div className="grid gap-3 xl:grid-cols-2">
        {overview.tables.map((table) => (
          <DataTable key={table.key} table={table} lang={lang} />
        ))}
      </div>
    </>
  );
}

export default async function AdminOverviewPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;

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
        <Suspense fallback={<OverviewSkeleton lang={lang} />}>
          <OverviewContent lang={lang} load={() => getPlatformOverview(admin.platformRole)} />
        </Suspense>
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
        <Suspense fallback={<OverviewSkeleton lang={lang} />}>
          <OverviewContent lang={lang} load={() => getCommandOverview(admin.organizationId)} />
        </Suspense>
      </SectionView>
    </div>
  );
}
