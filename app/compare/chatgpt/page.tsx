import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/compare/chatgpt` },
  description:
    "مقارنة صريحة بين ZOOKA AI وChatGPT: أيهما أفضل للذكاء العام وأيهما أفضل لتنفيذ المهام على أدوات شركتك، وحقيقة التجربة المجانية. An honest ZOOKA AI vs ChatGPT comparison.",
  keywords: [
    "Zooka AI vs ChatGPT",
    "مقارنة ChatGPT",
    "وكيل أعمال ذكي",
    "AI agent عربي",
    "ChatGPT بديل",
  ],
  title: "Zooka AI مقابل ChatGPT — مقارنة صريحة",
};

const ROWS = [
  {
    label: { ar: "الاستخدام العام", en: "General usage" },
    chatgpt: {
      ar: "أقوى: كتابة، برمجة، تحليل، بحث، تعلّم.",
      en: "Stronger: writing, coding, analysis, research, learning.",
    },
    zooka: {
      ar: "أضعف نسبيًا — زوكا مش بديل مساعد عام.",
      en: "Weaker by comparison — Zooka is not a general assistant.",
    },
  },
  {
    label: { ar: "التنفيذ على أدواتك", en: "Acting on your tools" },
    chatgpt: {
      ar: "محدود: تكاملات سطحية أو إضافات خارجية.",
      en: "Limited: shallow connectors or third-party add-ons.",
    },
    zooka: {
      ar: "قوي: بريد، ملفات، كود، نشر، أتمتة، وAgent Mode بخطوات.",
      en: "Strong: email, files, code, deploy, automation and multi-step agent mode.",
    },
  },
  {
    label: { ar: "بيانات الشركة", en: "Company data" },
    chatgpt: {
      ar: "حساب شخصي، ومساحة فريق في باقات الفريق.",
      en: "Personal account; team features on team plans.",
    },
    zooka: {
      ar: "مساحة عمل بفِرَق وأدوار، سجل تدقيق، وتشفير AES-256-GCM للرموز.",
      en: "Workspace with teams and roles, audit trail, AES-256-GCM token encryption.",
    },
  },
  {
    label: { ar: "العربي والأعمال المحلية", en: "Arabic and local business" },
    chatgpt: {
      ar: "عربي جيد ويتحسّن باستمرار.",
      en: "Good Arabic that keeps improving.",
    },
    zooka: {
      ar: "مبني حوله: قطاعات تنظيف وعيادات وعقارات ومطاعم، ودعم صوت عربي.",
      en: "Built around it: cleaning, clinics, real estate, restaurants, plus Arabic voice.",
    },
  },
  {
    label: { ar: "النضج والاستقرار", en: "Maturity" },
    chatgpt: {
      ar: "منتج ناضج من شركة كبيرة.",
      en: "A mature product from a large company.",
    },
    zooka: {
      ar: "منتج ناشئ — نتطوّر بسرعة، ونتوقع ملاحظاتك.",
      en: "An emerging product — we ship fast and expect your feedback.",
    },
  },
  {
    label: { ar: "السعر", en: "Price" },
    chatgpt: {
      ar: "باقة مجانية محدودة + باقات مدفوعة.",
      en: "A limited free tier plus paid plans.",
    },
    zooka: {
      ar: "تجربة تعريفية مجانية، والاستخدام التجاري 19$ أو 49$ شهريًا.",
      en: "A free preview; commercial use from $19 or $49 per month.",
    },
  },
] as const;

const FAQ = [
  {
    q: {
      ar: "هل Zooka AI أفضل من ChatGPT؟",
      en: "Is Zooka AI better than ChatGPT?",
    },
    a: {
      ar: "في المجمل لا. ChatGPT أقوى كمساعد ذكاء عام. زوكا أفضل في حالة واحدة: لما تحتاج وكيل ينفّذ مهمة على بريدك وملفاتك وكودك داخل مساحة عمل شركتك.",
      en: "Overall, no. ChatGPT is stronger as a general assistant. Zooka wins in one case: when you need an agent to carry out a task on your email, files and code inside your company workspace.",
    },
  },
  {
    q: { ar: "هل Zooka AI مجاني؟", en: "Is Zooka AI free?" },
    a: {
      ar: "فيه تجربة مجانية للتعريف: 10 رسائل يوميًا بدون حساب، أو 1,000 رسالة شهريًا بحساب مجاني. لكن الخدمة نفسها مش مجانية: ربط تكاملات شركتك وتشغيل الوكيل يحتاج باقة مدفوعة تبدأ من 19$ شهريًا.",
      en: "There is a free preview: 10 messages a day without an account, or 1,000 messages a month with a free account. The service itself is not free: connecting your company tools and running the agent needs a paid plan from $19 per month.",
    },
  },
  {
    q: {
      ar: "أي نماذج ذكاء اصطناعي يستخدمها زوكا؟",
      en: "Which AI models does Zooka use?",
    },
    a: {
      ar: "نماذج GPT وClaude وGemini عبر مزوّد موحّد، والباقة المجانية تعمل على نماذج أساسية. الوكيل في وضع Agent Mode ينفّذ خطوات متعددة على أدواتك المربوطة.",
      en: "GPT, Claude and Gemini models through one gateway; the free plan runs on standard models. In agent mode Zooka executes multi-step actions on your connected tools.",
    },
  },
  {
    q: {
      ar: "هل يمكن استخدام الاثنين معًا؟",
      en: "Can I use both?",
    },
    a: {
      ar: "نعم، وهذا شائع: استخدم ChatGPT للتفكير والكتابة العامة، وزوكا لتنفيذ المهام المتكررة على أدوات شركتك (ردود البريد، التقارير، الأتمتة).",
      en: "Yes, and it is common: use ChatGPT for thinking and general writing, and Zooka for recurring work on your company tools (email replies, reports, automation).",
    },
  },
] as const;

export default function CompareChatGptPage() {
  return (
    <Suspense fallback={null}>
      <CompareChatGptContent />
    </Suspense>
  );
}

async function CompareChatGptContent() {
  const lang = await getLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a[lang],
          },
          name: item.q[lang],
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            item: `${SITE_URL}/`,
            name: "Zooka AI",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${SITE_URL}/compare/chatgpt`,
            name: t("مقارنة مع ChatGPT", "Compare with ChatGPT"),
            position: 2,
          },
        ],
      },
    ],
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />

      <div className="flex items-center justify-between">
        <Link className="text-muted-foreground text-sm hover:underline" href="/">
          ZOOKA AI
        </Link>
        <LanguageToggle lang={lang} />
      </div>

      <header className="flex flex-col gap-4">
        <span className="w-fit rounded-full border px-3 py-1 text-xs">
          {t("مقارنة صريحة", "An honest comparison")}
        </span>
        <h1 className="font-semibold text-3xl leading-tight">
          {t(
            "Zooka AI مقابل ChatGPT: أيهما يناسب شغلك؟",
            "Zooka AI vs ChatGPT: which one fits your work?"
          )}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "الخلاصة من الأول: ChatGPT أقوى كمساعد ذكاء عام، وزوكا مش بديل له. زوكا وكيل تنفيذ على أدوات شركتك بالعربي. الاختيار بيعتمد على اللي محتاجه فعلًا.",
            "The short answer first: ChatGPT is stronger as a general AI assistant, and Zooka is not its replacement. Zooka is an execution agent on your company tools, in Arabic. The choice depends on what you actually need."
          )}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-xl">
          {t("المقارنة بالتفصيل", "The detail")}
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-start">
                <th className="p-3 text-start font-medium">
                  {t("الجانب", "Aspect")}
                </th>
                <th className="p-3 text-start font-medium">ChatGPT</th>
                <th className="p-3 text-start font-medium">Zooka AI</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr className="border-b last:border-0" key={row.label.en}>
                  <td className="p-3 font-medium">{row.label[lang]}</td>
                  <td className="p-3 text-muted-foreground">
                    {row.chatgpt[lang]}
                  </td>
                  <td className="p-3">{row.zooka[lang]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h2 className="mb-2 font-semibold text-lg">
            {t("اختار زوكا لو…", "Choose Zooka if…")}
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              {t(
                "محتاج وكيل يشتغل على بريدك وملفاتك وكودك وينفّذ المهمة للنهاية.",
                "You need an agent to work on your email, files and code through to completion."
              )}
            </li>
            <li>
              {t(
                "عندك فريق ومحتاج صلاحيات وسجل تدقيق وفاتورة رسمية.",
                "You have a team and need roles, an audit trail and proper invoicing."
              )}
            </li>
            <li>
              {t(
                "شغلك بالعربي وفي السوق المحلي (تنظيف، عيادات، عقارات، مطاعم).",
                "Your work is in Arabic and in the local market (cleaning, clinics, real estate, restaurants)."
              )}
            </li>
          </ul>
        </div>
        <div className="rounded-xl border p-5">
          <h2 className="mb-2 font-semibold text-lg">
            {t("اختار ChatGPT لو…", "Choose ChatGPT if…")}
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              {t(
                "استخدامك الأساسي أسئلة وكتابة وبرمجة وتعلّم وتحليل عام.",
                "Your main use is questions, writing, coding, learning and general analysis."
              )}
            </li>
            <li>
              {t(
                "محتاج منتج ناضج جدًا وميزات زي Projects وCanvas.",
                "You need a very mature product with features like Projects and Canvas."
              )}
            </li>
            <li>
              {t(
                "مش محتاج ربط أدوات شركة ولا تنفيذ خطوات على بياناتك.",
                "You don't need company tool connections or actions on your own data."
              )}
            </li>
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-semibold text-lg">
          {t("والتجربة المجانية؟", "And the free part?")}
        </h2>
        <p className="text-sm">
          {t(
            "فيه تجربة تعريفية مجانية، لكن الخدمة نفسها مش مجانية. ده التفصيل بالظبط:",
            "There is a free preview, but the service itself is not free. Here is exactly how it works:"
          )}
        </p>
        <ol className="flex list-inside list-decimal flex-col gap-2 text-muted-foreground text-sm">
          <li>
            {t(
              "10 رسائل يوميًا بدون تسجيل وبدون بطاقة، والعداد يرجع كل يوم.",
              "10 messages a day with no sign-up and no card; the count refreshes daily."
            )}
          </li>
          <li>
            {t(
              "بعد التسجيل: باقة تجريبية 1,000 رسالة شهريًا بنماذج أساسية، بدون ربط تكاملات وبدون Agent Mode.",
              "After sign-up: a trial plan with 1,000 messages a month on standard models, without tool connections or agent mode."
            )}
          </li>
          <li>
            {t(
              "الاستخدام التجاري: ربط أدوات الشركة وتشغيل الوكيل وفِرَق وصلاحيات وفاتورة رسمية — من 19$ (احترافي) أو 49$ (الأعمال) شهريًا.",
              "Commercial use: company tool connections, agent runs, teams, roles and invoicing — from $19 (Pro) or $49 (Business) per month."
            )}
          </li>
        </ol>
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          <Link
            className="rounded-lg bg-foreground px-4 py-2 font-medium text-background"
            href="/"
          >
            {t("جرّب زوكا الآن", "Try Zooka now")}
          </Link>
          <Link className="rounded-lg border px-4 py-2" href="/pricing">
            {t("شوف الباقات", "See plans")}
          </Link>
          <Link className="rounded-lg border px-4 py-2" href="/contact">
            {t("اطلب عرض سعر للشركات", "Request a business quote")}
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">
          {t("أسئلة متكررة", "Frequently asked")}
        </h2>
        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details className="rounded-xl border p-4" key={item.q.en}>
              <summary className="cursor-pointer font-medium">
                {item.q[lang]}
              </summary>
              <p className="mt-2 text-muted-foreground text-sm">
                {item.a[lang]}
              </p>
            </details>
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-4 border-t pt-6 text-muted-foreground text-sm">
        <Link href="/">ZOOKA AI</Link>
        <Link href="/pricing">{t("الأسعار", "Pricing")}</Link>
        <Link href="/contact">{t("تواصل معنا", "Contact")}</Link>
        <Link href="/privacy">{t("سياسة الخصوصية", "Privacy")}</Link>
        <Link href="/terms">{t("شروط الخدمة", "Terms")}</Link>
      </nav>
    </main>
  );
}
