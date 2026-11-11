import type { Metadata } from "next";
import Link from "next/link";

import { SITE_URL } from "@/lib/site";

const PAGE_URL = `${SITE_URL}/ar`;

export const metadata: Metadata = {
  title: "ZOOKA AI — وكيل أعمال ذكي لشركات الخدمات في الإمارات",
  description:
    "وكيل ذكاء اصطناعي يرد على عملائك، يجهّز عروض الأسعار والفواتير، ويتابع الطلبات من محادثة واحدة — بالعربية أو الإنجليزية. جرّبه مجانًا.",
  alternates: {
    canonical: PAGE_URL,
    languages: {
      ar: PAGE_URL,
      en: SITE_URL,
      "x-default": SITE_URL,
    },
  },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    siteName: "Zooka AI",
    title: "ZOOKA AI — وكيل أعمال ذكي لشركات الخدمات في الإمارات",
    description:
      "موظف ذكي يرد على عملائك ويُنجز المهمة من محادثة واحدة: عروض أسعار، فواتير، متابعة طلبات.",
    locale: "ar_AE",
  },
};

const TASKS = [
  "اكتب رد واتساب احترافي لعميل يسأل عن أسعار خدمة التنظيف",
  "جهّز عرض سعر لشركة مقاولات بصيغة جدول",
  "اقترح خطة تسويق شهرية لمطعم في دبي",
  "صغ بريدًا لمتابعة فاتورة متأخرة بلطف",
];

const CAPABILITIES = [
  {
    title: "بريد إلكتروني نيابةً عنك",
    body: "يقرأ ويبحث ويرسل من جيميل حسابك الخاص بعد موافقتك، ويحفظ الرموز مشفّرة لمساحة عملك فقط.",
  },
  {
    title: "ملفاتك ومستنداتك",
    body: "يبحث في درايف ويقرأ المستندات ويستخدمها كسياق للرد، ويحفظ ما يولّده في ملفاتك.",
  },
  {
    title: "كود ونشر",
    body: "يقرأ مستودعات جيت هب، يفتح المهام، ويراجع النشر — دون أن تنسخ وتلصق أي شيء.",
  },
  {
    title: "أتمتة حقيقية",
    body: "يشغّل سير عمل n8n الخاص بك ويحوّل الطلبات المتكررة إلى خطوات تعمل من نفسها.",
  },
  {
    title: "قرارات بموافقتك",
    body: "ينفّذ المهمة كاملة بنفسه، ولا يتوقف ليسألك إلا عند قرار حساس أو إنفاق أو إرسال لطرف خارجي.",
  },
  {
    title: "باقات تتمايز بوضوح",
    body: "فرد، شركة، مكتب، أو مؤسسة بفروع: لكل مستوى حدوده وعدد أعضائه وسجل تدقيقه.",
  },
];

const PLANS = [
  {
    name: "مجاني",
    price: "$0",
    period: "للأبد",
    forWho: "للتجربة",
    features: [
      "1,000 رسالة شهريًا",
      "النماذج الأساسية",
      "مساحة عمل واحدة",
      "بدون ربط أدوات وبدون وضع الوكيل",
    ],
    cta: "ابدأ مجانًا",
    ctaHref: "/auth",
    highlight: false,
  },
  {
    name: "احترافي",
    price: "$19",
    period: "شهريًا",
    forWho: "للفرد والمستقل",
    features: [
      "10,000 رسالة شهريًا",
      "النماذج المتقدمة",
      "ربط جيميل ودرايف",
      "وضع الوكيل والبحث في الويب",
    ],
    cta: "اختر الاحترافي",
    ctaHref: "/pricing",
    highlight: true,
  },
  {
    name: "الأعمال",
    price: "$49",
    period: "شهريًا",
    forWho: "للشركات والمكاتب",
    features: [
      "100,000 رسالة شهريًا",
      "مساحات عمل للفريق وأعضاء متعددون",
      "سجل تدقيق للتكاملات",
      "دعم بأولوية",
    ],
    cta: "اختر الأعمال",
    ctaHref: "/pricing",
    highlight: false,
  },
  {
    name: "مؤسسات",
    price: "على الطلب",
    period: "سنوي",
    forWho: "للمجموعات والفروع",
    features: [
      "حدود مخصصة لكل قسم",
      "عزل بيانات صارم لكل فرع",
      "تكاملات مبنية حسب طلبك",
      "مدير نجاح مخصص",
    ],
    cta: "تحدث معنا",
    ctaHref: "/contact",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "هل يحتاج الوكيل أن أعطيه كلمة مرور حسابي؟",
    a: "لا. الربط يتم عبر OAuth مباشرة من جوجل أو جيت هب، وتُحفظ الرموز مشفّرة لمساحة عملك، ويمكنك فصل أي تكامل في أي وقت.",
  },
  {
    q: "هل بياناتي مشتركة بين المساحات؟",
    a: "لا. كل مساحة عمل معزولة ببياناتها وتكاملاتها، وعزل الفروع متاح في باقة المؤسسات.",
  },
  {
    q: "ما الفرق بين الوضع العادي ووضع الوكيل؟",
    a: "الوضع العادي يكتب ويولّد داخل المحادثة. وضع الوكيل ينفّذ المهمة: يبحث، يقرأ، يجهّز الملف، ويرسل — بعد موافقتك.",
  },
  {
    q: "هل يمكنني الإلغاء أو تغيير الباقة؟",
    a: "نعم، التغيير والإلغاء من إعدادات الحساب، ويسري التغيير من دورة الفوترة التالية.",
  },
];

export default function ArabicLandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Zooka AI",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: PAGE_URL,
        inLanguage: "ar",
        description:
          "وكيل ذكاء اصطناعي لشركات الخدمات في الإمارات: ردود العملاء، عروض الأسعار، الفواتير، والأتمتة.",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          lowPrice: "0",
          highPrice: "49",
          offerCount: 3,
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <div
      className="min-h-screen bg-white text-slate-900"
      dir="rtl"
      lang="ar"
      style={{ fontFamily: "var(--font-cairo), system-ui, sans-serif" }}
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is static and serialized here
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />

      <main className="mx-auto max-w-5xl px-5 py-16">
        <section className="text-center">
          <p className="mb-4 inline-block rounded-full bg-blue-50 px-4 py-1 text-blue-700 text-sm">
            مصمم لشركات الخدمات في الإمارات
          </p>
          <h1 className="mx-auto max-w-3xl text-balance font-bold text-4xl leading-tight md:text-5xl">
            موظف ذكي يرد على عملائك ويُنجز المهمة من محادثة واحدة
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 leading-relaxed">
            Zooka يكتب الردود، يجهّز عروض الأسعار والفواتير، ويتابع الطلبات — بالعربية
            أو الإنجليزية، وبلغة أعمال محترمة.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
              href="/auth"
            >
              ابدأ مجانًا
            </Link>
            <Link
              className="rounded-xl border border-slate-300 px-6 py-3 font-semibold transition hover:border-slate-400"
              href="/pricing"
            >
              عرض الخطط
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="mb-5 text-center font-semibold text-2xl">جرّب واحدة من هذه المهام</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {TASKS.map((task) => (
              <li
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700"
                key={task}
              >
                {task}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-center font-semibold text-2xl">ماذا يستطيع Zooka أن يفعل؟</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <div className="rounded-2xl border border-slate-200 p-5" key={item.title}>
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="mb-2 text-center font-semibold text-2xl">خطط واضحة تناسب حجم عملك</h2>
          <p className="mb-6 text-center text-slate-500 text-sm">الأسعار بالدولار الأمريكي</p>
          <div className="grid gap-4 md:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                className={`flex flex-col rounded-2xl border p-5 ${
                  plan.highlight
                    ? "border-blue-600 shadow-sm ring-1 ring-blue-600"
                    : "border-slate-200"
                }`}
                key={plan.name}
              >
                <p className="text-slate-500 text-xs">{plan.forWho}</p>
                <h3 className="mt-1 font-bold text-xl">{plan.name}</h3>
                <p className="mt-2">
                  <span className="font-bold text-3xl">{plan.price}</span>{" "}
                  <span className="text-slate-500 text-sm">{plan.period}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-slate-700 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link
                  className={`mt-5 rounded-xl px-4 py-2 text-center font-semibold transition ${
                    plan.highlight
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-slate-300 hover:border-slate-400"
                  }`}
                  href={plan.ctaHref}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-center font-semibold text-2xl">أسئلة شائعة</h2>
          <div className="space-y-3">
            {FAQS.map((item) => (
              <details className="rounded-xl border border-slate-200 p-4" key={item.q}>
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl bg-slate-900 p-8 text-center text-white">
          <h2 className="font-semibold text-2xl">جاهز تجرّب Zooka على شغلك الحقيقي؟</h2>
          <p className="mt-2 text-slate-300">
            ابدأ بالباقة المجانية، واربط أدواتك عندما تكون جاهزًا.
          </p>
          <Link
            className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-slate-900"
            href="/auth"
          >
            ابدأ مجانًا
          </Link>
        </section>

        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>
            <Link className="hover:text-slate-700" href="/">
              English
            </Link>
            {" · "}
            <Link className="hover:text-slate-700" href="/contact">
              تواصل معنا
            </Link>
            {" · "}
            <Link className="hover:text-slate-700" href="/privacy">
              الخصوصية
            </Link>
            {" · "}
            <Link className="hover:text-slate-700" href="/terms">
              الشروط
            </Link>
          </p>
          <p className="mt-3">© 2026 Zooka AI</p>
        </footer>
      </main>
    </div>
  );
}
