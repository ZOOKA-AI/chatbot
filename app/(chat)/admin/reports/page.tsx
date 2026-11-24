import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { SectionView } from "@/components/admin/ui";

export const metadata = { title: "التقارير اليومية — ZOOKA-AI" };

/**
 * Daily reports need somewhere to be stored before they can be shown.
 *
 * The table that would hold them is not applied yet, and creating it is a production schema change that
 * needs the owner's approval. Until then this page states exactly that instead of rendering an empty
 * report that reads like a quiet day.
 */
export default async function ReportsPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const lang = admin.lang;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "التقارير اليومية" : "Daily reports"}
      description={
        lang === "ar"
          ? "تقرير الساعة 23:59 بتوقيت الإمارات، محفوظ بالتاريخ لمراجعة الأيام ومقارنتها."
          : "The 23:59 Asia/Dubai report, stored by date so days can be reviewed and compared."
      }
    >
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium">
          {lang === "ar" ? "التخزين غير مهيّأ بعد." : "Storage is not configured yet."}
        </p>
        <p className="mt-1 text-xs text-amber-100/80">
          {lang === "ar"
            ? "عرض التقارير يحتاج جدولًا دائمًا (AdminReport). إنشاؤه تغيير مخطط على الإنتاج ويحتاج موافقتك، ثم يُطبَّق على نسخة معاينة أولًا ويُختبر قبل الإنتاج."
            : "Showing reports needs a durable table (AdminReport). Creating it is a production schema change and needs your approval; it will be applied to a preview clone and tested before production."}
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
        <p className="font-medium text-white/80">
          {lang === "ar" ? "ما سيحويه التقرير" : "What the report will contain"}
        </p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>{lang === "ar" ? "المستخدمون الجدد والنشطون، والمحادثات والرسائل." : "New and active users, conversations and messages."}</li>
          <li>{lang === "ar" ? "طلبات الوكيل: ناجحة، فاشلة، غير مكتملة." : "Agent requests: succeeded, failed, incomplete."}</li>
          <li>{lang === "ar" ? "الأعطال الجديدة والمتكررة وبصماتها." : "New and recurring incidents with their fingerprints."}</li>
          <li>{lang === "ar" ? "الاستوديوهات، المتصفح، البريد، التكاملات." : "Studios, browser, mail, integrations."}</li>
          <li>{lang === "ar" ? "الإصلاحات المنجزة والمعلّقة، وخطة اليوم التالي." : "Completed and blocked repairs, and the next day's plan."}</li>
        </ul>
      </div>
    </SectionView>
  );
}
