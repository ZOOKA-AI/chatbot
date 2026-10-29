import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "الشركاء | Partners",
  description: "اكسب 20% عمولة مع برنامج شركاء Zooka AI",
};

export default async function PartnersPage() {
  const lang = await getLang();
  const isAr = lang === "ar";

  const benefits = [
    {
      title: isAr ? "رابط خاص" : "Custom Link",
      description: isAr
        ? "تحصل على رابط إحالة بعد قبول طلبك"
        : "Get a referral link after your application is approved",
    },
    {
      title: isAr ? "60 يوم" : "60 Days",
      description: isAr
        ? "مدة الإحالة المقترحة"
        : "Proposed attribution window",
    },
    {
      title: "20%",
      description: isAr
        ? "عمولة متكررة على الاشتراكات المؤهلة"
        : "Recurring commission on eligible subscriptions",
    },
  ];

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle lang={lang} />
      </div>

      <header className="text-center">
        <p className="font-medium text-primary text-sm">
          {isAr ? "برنامج الشراكة" : "Partner Program"}
        </p>
        <h1 className="mt-2 font-bold text-4xl md:text-5xl">
          {isAr ? "اكسب مع Zooka AI" : "Earn with Zooka AI"}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          {isAr
            ? "شارك رابطك بعد قبولك كشريك واحصل على 20% عمولة من الاشتراكات المدفوعة المؤهلة، بدون حد أدنى."
            : "After approval, share your referral link and earn 20% on eligible paid subscriptions, with no minimum."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground"
            href="/partners/join"
          >
            {isAr ? "سجّل كشريك" : "Join as Partner"}
          </Link>
          <Link
            className="rounded-lg border px-6 py-3 font-medium"
            href="/pricing"
          >
            {isAr ? "شاهد الأسعار" : "View pricing"}
          </Link>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-xs text-muted-foreground">
          {isAr
            ? "يُراجع الفريق الطلبات يدوياً. روابط الإحالة وتتبع العمولات غير مفعّلة بعد؛ تُحدد تفاصيل الإسناد والدفع عند قبول الطلب."
            : "Applications are reviewed manually. Referral links and commission tracking are not active yet; attribution and payout terms will be confirmed upon approval."}
        </p>
      </header>

      <section
        aria-label={isAr ? "مزايا البرنامج" : "Program highlights"}
        className="grid gap-4 sm:grid-cols-3"
      >
        {benefits.map((benefit) => (
          <article
            className="rounded-xl border p-5 text-center"
            key={benefit.title}
          >
            <h2 className="font-semibold text-2xl">{benefit.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {benefit.description}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border p-6">
        <h2 className="font-semibold text-xl">
          {isAr ? "كيف تبدأ؟" : "How to start"}
        </h2>
        <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-sm">
          <li>{isAr ? "أرسل نموذج التسجيل" : "Submit the application form"}</li>
          <li>
            {isAr ? "راجع طلبك مع الفريق" : "Wait for the team to review it"}
          </li>
          <li>
            {isAr
              ? "استلم كودك ورابطك الخاص بعد القبول"
              : "Receive your code and referral link after approval"}
          </li>
          <li>
            {isAr
              ? "تابع العمولات من لوحة الشركاء عند إتاحتها"
              : "Track commissions in the partner dashboard when it becomes available"}
          </li>
        </ol>
      </section>

      <footer className="text-center text-sm text-muted-foreground">
        <Link className="underline" href="/">
          {isAr ? "العودة إلى المحادثة" : "Back to chat"}
        </Link>
      </footer>
    </main>
  );
}
