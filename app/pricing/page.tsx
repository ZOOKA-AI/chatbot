import type { Metadata } from "next";
import Link from "next/link";
import { plans } from "@/components/marketing/landing-page";
import { SITE_URL } from "@/lib/site";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "الأسعار والباقات | Pricing",
  description:
    "باقات Zooka AI: مجاني، احترافي، الأعمال، ومؤسسات — بحدود واضحة للرسائل وتشغيل الوكلاء والبحث، ومساحات عمل للفرق وسجل تدقيق للتكاملات.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default async function PricingPage() {
  const lang = await getLang();
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);

  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-4xl">
          {t("الباقات والأسعار", "Plans and pricing")}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {t(
            "كل باقة تُحدد بعدد الرسائل وتشغيل الوكلاء والبحث، وعدد الأعضاء، ومستوى سجل التدقيق. الترقية أو التخفيض أو الإلغاء من داخل التطبيق.",
            "Every plan sets message limits, agent runs and searches, seat count and audit depth. Upgrade, downgrade or cancel from inside the app."
          )}
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            className={
              plan.highlight
                ? "flex flex-col rounded-xl border-2 border-foreground p-6"
                : "flex flex-col rounded-xl border p-6"
            }
            key={plan.id}
          >
            <span className="text-xs text-muted-foreground">{plan.tag[lang]}</span>
            <h2 className="mt-2 font-semibold text-xl">{plan.name[lang]}</h2>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="font-semibold text-3xl">{plan.price[lang]}</span>
              <span className="text-sm text-muted-foreground">{plan.period[lang]}</span>
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
              {plan.features[lang].map((feature) => (
                <li className="flex gap-2" key={feature}>
                  <span aria-hidden="true">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              className={
                plan.highlight
                  ? "mt-5 rounded-lg bg-foreground px-4 py-2 text-center font-medium text-background text-sm"
                  : "mt-5 rounded-lg border px-4 py-2 text-center font-medium text-sm"
              }
              href={plan.href}
            >
              {plan.cta[lang]}
            </Link>
          </article>
        ))}
      </section>

      <section className="rounded-xl border p-6">
        <h2 className="font-medium">{t("ملاحظات على الفواتير", "Billing notes")}</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            {t(
              "الأسعار بالدولار الأمريكي شهريًا، وتُحصَّل عبر Stripe. الفاتورة باسم Planet Zooka AI.",
              "Prices are monthly in USD and collected through Stripe. Invoices are issued under Planet Zooka AI."
            )}
          </li>
          <li>
            {t(
              "الباقة المجانية لا تتطلب بطاقة، وحدودها تُطبَّق على مساحة العمل بالكامل.",
              "The free plan needs no card, and its limits apply to the whole workspace."
            )}
          </li>
          <li>
            {t(
              "للحصول على فاتورة ضريبية أو عرض سعر سنوي للشركات، استخدم صفحة التواصل.",
              "For a tax invoice or an annual company quote, use the contact page."
            )}
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/">
          {t("العودة إلى الرئيسية", "Back to home")}
        </Link>
        <Link className="underline" href="/refund">
          {t("سياسة الاسترداد", "Refund policy")}
        </Link>
        <Link className="underline" href="/contact">
          {t("تواصل معنا", "Contact us")}
        </Link>
      </div>
    </main>
  );
}
