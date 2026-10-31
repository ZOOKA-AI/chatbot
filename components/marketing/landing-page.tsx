import Link from "next/link";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import {
  Compare,
  HowItWorks,
  PostersSection,
  UseCases,
  VideoSection,
} from "@/components/marketing/showcase";
import { DemoChat } from "@/components/marketing/demo-chat";
import { TaskTemplates } from "@/components/marketing/task-templates";
import { SiteHeader } from "@/components/marketing/site-header";
import { dirOf, fontOf } from "@/lib/i18n";
import { planFeatures } from "@/lib/billing/entitlements";
import { CTA } from "@/lib/marketing/cta";

type Lang = "ar" | "en";

export const plans = [
  {
    id: "free",
    note: { ar: "كتابة وتوليد داخل المحادثة. لا ربط أدوات ولا وضع وكيل.", en: "Writing and drafting in chat. No tool connections, no agent mode." },
    name: { ar: "مجاني", en: "Free" },
    price: { ar: "0", en: "0" },
    period: { ar: "للأبد", en: "forever" },
    tag: { ar: "للتجربة", en: "Start here" },
    features: {
      ar: planFeatures("ar").free,
      en: planFeatures("en").free,
    },
    cta: { ar: "ابدأ مجانًا", en: "Start free" },
    href: "/register",
    highlight: false,
  },
  {
    id: "pro",
    note: { ar: "كل التكاملات المتاحة + وضع الوكيل حتى إنجاز المهمة.", en: "All live integrations + agent mode that runs the task to the end." },
    name: { ar: "احترافي", en: "Pro" },
    price: { ar: "19", en: "19" },
    period: { ar: "شهريًا", en: "per month" },
    tag: { ar: "للفرد والمستقل", en: "Solo & freelance" },
    features: {
      ar: planFeatures("ar").pro,
      en: planFeatures("en").pro,
    },
    cta: { ar: "اختر الاحترافي", en: "Choose Pro" },
    href: "/register?plan=pro",
    highlight: true,
  },
  {
    id: "business",
    note: { ar: "نفس الاحترافي + فريق وسجل تدقيق ودعم بأولوية.", en: "Everything in Pro + team seats, audit log and priority support." },
    name: { ar: "الأعمال", en: "Business" },
    price: { ar: "49", en: "49" },
    period: { ar: "شهريًا", en: "per month" },
    tag: { ar: "للشركات والمكاتب", en: "Companies & offices" },
    features: {
      ar: [
        ...planFeatures("ar").business,
        "مساحات عمل للفريق وأعضاء متعددون",
        "سجل تدقيق للتكاملات",
        "دعم بأولوية",
      ],
      en: [
        ...planFeatures("en").business,
        "Team workspaces & multiple members",
        "Integration audit log",
        "Priority support",
      ],
    },
    cta: { ar: "اختر الأعمال", en: "Choose Business" },
    href: "/register?plan=business",
    highlight: false,
  },
  {
    id: "enterprise",
    note: { ar: "فروع متعددة، اتفاقية خدمة، وتسعير بحسب الاستخدام.", en: "Multiple branches, service agreement, usage-based pricing." },
    name: { ar: "مؤسسات", en: "Enterprise" },
    price: { ar: "على الطلب", en: "Custom" },
    period: { ar: "سنوي", en: "annual" },
    tag: { ar: "للمجموعات والفروع", en: "Groups & branches" },
    features: {
      ar: [
        "حدود مخصصة لكل قسم",
        "عزل بيانات صارم لكل فرع",
        "تكاملات مبنية حسب طلبك",
        "تدريب الفريق والترحيل",
        "مدير نجاح مخصص",
      ],
      en: [
        "Custom limits per department",
        "Strict data isolation per branch",
        "Integrations built to your order",
        "Team onboarding and migration",
        "Dedicated success manager",
      ],
    },
    cta: { ar: "تحدث معنا", en: "Talk to us" },
    href: "/contact",
    highlight: false,
  },
];

const capabilities = [
  {
    title: { ar: "بريد إلكتروني نيابةً عنك", en: "Email on your behalf" },
    body: {
      ar: "يقرأ ويبحث ويرسل من جيميل حسابك الخاص بعد موافقتك، ويحفظ الرموز مشفّرة لمساحة عملك فقط.",
      en: "Reads, searches and sends from your own Gmail after your consent, with tokens encrypted for your workspace only.",
    },
  },
  {
    title: { ar: "ملفاتك ومستنداتك", en: "Your files and documents" },
    body: {
      ar: "يبحث في درايف ويقرأ المستندات ويستخدمها كسياق للرد، ويحفظ ما يولّده في ملفاتك.",
      en: "Searches Drive, reads documents as context for answers, and stores what it generates back in your files.",
    },
  },
  {
    title: { ar: "كود ونشر", en: "Code and shipping" },
    body: {
      ar: "يقرأ مستودعات جيت هب، يفتح المهام، ويراجع النشر على فيرسل — دون أن تنسخ ولصق أي شيء.",
      en: "Reads GitHub repositories, opens issues and reviews Vercel deployments without any copy-paste.",
    },
  },
  {
    title: { ar: "أتمتة حقيقية", en: "Real automation" },
    body: {
      ar: "يشغّل سير عمل n8n الخاص بك ويحوّل الطلبات المتكررة إلى خطوات تعمل من نفسها.",
      en: "Triggers your own n8n workflows and turns repeated requests into steps that run themselves.",
    },
  },
  {
    title: { ar: "قرارات بموافقتك", en: "Decisions stay yours" },
    body: {
      ar: "ينفّذ المهمة كاملة بنفسه، ولا يتوقف ليسألك إلا عند قرار حساس أو إنفاق أو إرسال لطرف خارجي.",
      en: "Carries the task through by itself and only stops to ask on a sensitive decision, spend, or message to someone new.",
    },
  },
  {
    title: { ar: "باقات تتمايز بوضوح", en: "Plans that actually differ" },
    body: {
      ar: "فرد، شركة، مكتب، أو مؤسسة بفروع: لكل مستوى حدوده وعدد أعضائه وسجل تدقيقه.",
      en: "Individual, company, office or multi-branch: each level has its own limits, seats and audit trail.",
    },
  },
];

const faqs = [
  {
    q: {
      ar: "هل يحتاج الوكيل أن أعطيه كلمة مرور حسابي؟",
      en: "Does the agent need my account password?",
    },
    a: {
      ar: "لا. الربط يتم بصفحة موافقة رسمية من المزوّد (OAuth)، وتُحفظ الرموز مشفّرة بـ AES-256-GCM ومربوطة بمساحة عملك، ويمكنك فصل الاتصال في أي وقت من صفحة التكاملات.",
      en: "No. Connections use the provider's official consent screen (OAuth); tokens are encrypted with AES-256-GCM, scoped to your workspace, and you can disconnect at any time from the integrations page.",
    },
  },
  {
    q: {
      ar: "هل بياناتي مشتركة بين المساحات؟",
      en: "Is my data shared across workspaces?",
    },
    a: {
      ar: "لا. كل جدول مرتبط بمساحة عمل، وسياسات الأمان على مستوى الصف (RLS) تمنع أي عضو من رؤية بيانات مساحة أخرى.",
      en: "No. Every table is scoped to a workspace, and Row Level Security stops any member from seeing another workspace's data.",
    },
  },
  {
    q: {
      ar: "ما الفرق بين الوضع العادي ووضع الوكيل؟",
      en: "What is different in agent mode?",
    },
    a: {
      ar: "الوضع العادي للأسئلة والكتابة. وضع الوكيل يمنح النموذج الأدوات ويسمح له بتنفيذ خطوات متعددة على أدواتك حتى ينجز المهمة.",
      en: "Plain mode answers and writes. Agent mode gives the model your tools and lets it run multi-step work until the task is done.",
    },
  },
  {
    q: {
      ar: "متى يُخصم من عداد الرسائل المجانية؟",
      en: "When does a free message get counted?",
    },
    a: {
      ar: "بعد أول جزء من الرد. لو انقطع الاتصال أو أوقفت الرد قبل أول كلمة، لا يُحسب ويعود لك فورًا — العدّاد محفوظ على السيرفر، مش في المتصفح.",
      en: "After the first part of the reply. If the connection drops or you stop it before the first word, it is not counted and comes straight back — the counter is server-side, not in your browser.",
    },
  },
  {
    q: {
      ar: "هل يمكنني الإلغاء أو تغيير الباقة؟",
      en: "Can I change or cancel a plan?",
    },
    a: {
      ar: "نعم، الترقية أو التخفيض أو الإلغاء متاح من صفحة إدارة الاشتراك، وسياسة الاسترداد منشورة على الموقع.",
      en: "Yes. Upgrade, downgrade or cancel from the subscription page, and the refund policy is published on the site.",
    },
  },
];

/** Providers a customer can connect by themselves from /settings/integrations today. */
export const SELF_SERVE = new Set([
  "google_drive",
  "gmail",
  "github",
  "vercel",
  "n8n",
]);

export function LandingPage({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const available = INTEGRATION_PROVIDERS.filter(
    (provider) => provider.status === "available"
  );
  const grouped = available.reduce<Record<string, typeof available>>(
    (accumulator, provider) => {
      accumulator[provider.category] = [
        ...(accumulator[provider.category] ?? []),
        provider,
      ];
      return accumulator;
    },
    {}
  );

  return (
    <div
      className="dark flex min-h-dvh flex-col bg-background text-foreground"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <SiteHeader lang={lang} />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(60% 60% at 80% 0%, rgba(37,99,235,0.25) 0%, transparent 60%), radial-gradient(50% 50% at 10% 20%, rgba(16,185,129,0.18) 0%, transparent 60%)",
            }}
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
            <div className="flex flex-col gap-8">
              <span className="w-fit rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {t(
                  "وكيل أعمال يعمل نيابةً عنك — لا مجرد محادثة",
                  "A business agent that works for you — not just a chat"
                )}
              </span>
              <h1 className="max-w-3xl font-semibold text-4xl leading-tight md:text-6xl">
                {t(
                  "زوكا AI يربط أدواتك وينفّذ المهمة حتى النهاية",
                  "Zooka AI connects your tools and finishes the job"
                )}
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                {t(
                  "بريدك وملفاتك وكودك وبياناتك — في محادثة واحدة، والوكيل ينفّذ الخطوات بنفسه.",
                  "Your email, files, code and data in one conversation, and the agent runs the steps itself."
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  className="rounded-lg bg-foreground px-6 py-3 font-medium text-background"
                  href={CTA.demo.href}
                >
                  {isArabic ? CTA.demo.ar : CTA.demo.en} ↓
                </a>
                <Link
                  className="rounded-lg border px-6 py-3 font-medium"
                  href={CTA.workspace.href}
                >
                  {isArabic ? CTA.workspace.ar : CTA.workspace.en}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(
                  "10 رسائل مجانية كل يوم · كتابة فقط، بدون فتح بريدك أو ملفاتك",
                  "10 free messages a day · writing only, we never open your mail or files"
                )}
              </p>
              <p className="-mt-4 text-sm">
                <Link className="text-blue-300 underline-offset-4 hover:underline" href="/pricing">
                  {t(
                    "ربط الأدوات ووضع الوكيل من باقة الاحترافي — 19$ شهريًا",
                    "Tool connections and Agent mode start on Pro — $19 a month"
                  )}
                </Link>
              </p>
            </div>
            <div className="relative">
              <DemoChat lang={lang} />
            </div>
          </div>
        </section>

        <section className="border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                kicker: t("مجاني", "Free"),
                title: t("اكتب وولّد الآن", "Write and draft now"),
                body: t(
                  "المحادثة والتوليد متاحان في التجربة — عشر رسائل كل يوم بدون حساب.",
                  "Chat and drafting work in the preview — ten messages a day, no account."
                ),
              },
              {
                kicker: t("على الاحترافي", "On Pro"),
                title: t("اربط أدواتك", "Connect your tools"),
                body: t(
                  "جيميل ودرايف وبقية الكتالوج عبر صفحة موافقة المزوّد. ليست في المجاني.",
                  "Gmail, Drive and the rest of the catalog through the provider's consent screen. Not on Free."
                ),
              },
              {
                kicker: t("حسب الباقة", "By plan"),
                title: t("وضع الوكيل", "Agent mode"),
                body: t(
                  "خطوات متعددة على الأدوات المربوطة حتى إنجاز المهمة، بعدد تشغيلات باقتك.",
                  "Multi-step work on connected tools until the task is done, within your plan's run quota."
                ),
              },
              {
                kicker: t("دائمًا", "Always"),
                title: t("أنت تقرّر", "You decide"),
                body: t(
                  "أي إرسال لطرف خارجي ينتظر موافقتك، والتجربة لا ترسل شيئًا نيابةً عنك.",
                  "Anything sent to an outside party waits for your approval; the preview never sends for you."
                ),
              },
            ].map((card) => (
              <div className="rounded-xl border p-5" key={card.title}>
                <span className="text-blue-400 text-xs uppercase tracking-widest">
                  {card.kicker}
                </span>
                <h3 className="mt-2 font-medium">{card.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <VideoSection lang={lang} />

        <PostersSection lang={lang} />

        <TaskTemplates lang={lang} />

        <section className="border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-14 md:grid-cols-3">
            {[
              {
                title: t("يفهم سياقك", "Understands your context"),
                body: t(
                  "مساحة عمل، أعضاء، ملفات ومحادثات — الوكيل يبني على ما لديك بدل أن يبدأ من الصفر كل مرة.",
                  "Workspace, members, files and chats — the agent builds on what you already have."
                ),
              },
              {
                title: t("ينفّذ بنفسه", "Executes by itself"),
                body: t(
                  "يفتح الموافقة، يربط الحساب، يقرأ ويرسل ويحدّث ويراجع — خطوات متعددة دون أن تديرها يدويًا.",
                  "Opens consent, connects accounts, reads, sends, updates and reviews across several steps."
                ),
              },
              {
                title: t("يحمي بياناتك", "Protects your data"),
                body: t(
                  "تشفير AES-256-GCM للرموز، عزل بمساحة العمل، وسجل تدقيق لكل إجراء على التكاملات.",
                  "AES-256-GCM token encryption, workspace isolation, and an audit trail for every integration action."
                ),
              },
            ].map((item) => (
              <div className="rounded-xl border p-6" key={item.title}>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b" id="capabilities">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="grid items-center gap-8 md:grid-cols-[1fr_280px]">
              <div>
                <h2 className="font-semibold text-3xl">
                  {t("ماذا ينفّذ فعليًا؟", "What does it actually do?")}
                </h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  {t(
                    "لا نبيع وعودًا: هذه القدرات مبنية ومختبَرة على zooka-ai.com نفسها.",
                    "No promises: these capabilities are built and tested on zooka-ai.com itself."
                  )}
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={t(
                  "وكيل زوكا AI محاط ببطاقات البريد والملفات والكود",
                  "Zooka AI agent surrounded by email, files and code cards"
                )}
                className="hidden w-full rounded-2xl border border-white/10 md:block"
                decoding="async"
                height={800}
                loading="lazy"
                src="/images/landing-agent.webp"
                width={800}
              />
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <article
                  className="rounded-xl border p-6 transition-colors hover:bg-muted/40"
                  key={capability.title.en}
                >
                  <h3 className="font-medium">{capability.title[lang]}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {capability.body[lang]}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <HowItWorks lang={lang} />

        <section className="border-b" id="integrations">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-semibold text-3xl">
                  {t("تكاملات جاهزة الآن", "Integrations live today")}
                </h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  {t(
                    `الربط الذاتي من داخل التطبيق جاهز لجوجل درايف وجيميل وجيت هب وفيرسل وn8n. وباقي الكتالوج (${available.length} من ${INTEGRATION_PROVIDERS.length}) يعمل عبر جسر الوكيل أو ينتظر موافقة المزوّد — بنكتبها صريحة بدل ما نوعد بربط بضغطة لكل حاجة.`,
                    `Self-serve connection is live for Google Drive, Gmail, GitHub, Vercel and n8n. The rest of the catalog (${available.length} of ${INTEGRATION_PROVIDERS.length}) runs through the agent bridge or waits on provider approval — stated plainly instead of promising one-click for everything.`
                  )}
                </p>
              </div>
              <Link className="text-sm underline" href="/login">
                {t("اربط حسابك", "Connect your account")}
              </Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(grouped).map(([category, items]) => (
                <div className="rounded-xl border p-5" key={category}>
                  <h3 className="text-sm text-muted-foreground">
                    {isArabic
                      ? PROVIDER_CATEGORIES[category]?.ar
                      : PROVIDER_CATEGORIES[category]?.en}
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {items.map((provider) => (
                      <li className="flex items-center justify-between gap-2" key={provider.id}>
                        <span>{isArabic ? provider.nameAr : provider.name}</span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {SELF_SERVE.has(provider.id)
                            ? t("ربط ذاتي", "self-serve")
                            : t("عبر الوكيل", "via agent")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <UseCases lang={lang} />

        <Compare lang={lang} />

        <section className="border-b" id="proof">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <span className="text-blue-400 text-xs uppercase tracking-widest">
              {t("أرقام حقيقية", "Real numbers")}
            </span>
            <h2 className="mt-2 font-semibold text-3xl">
              {t("أرقام نقدر نثبتها، لا شعارات", "Numbers we can prove, not badges")}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {t(
                "الأرقام تحت محسوبة من قاعدة بياناتنا في أكتوبر 2026، ومفيش شهادة عميل واحدة مدفوعة أو مكتوبة من عندنا — الشهادات مكانها فاضي لحد ما عميل حقيقي يكتبها باسمه.",
                "The numbers below are counted from our database in October 2026, and there is not one paid or in-house testimonial on this page — that space stays empty until a real customer writes one in their own name."
              )}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  value: "271",
                  label: t(
                    "حساب مسجّل حتى أكتوبر 2026",
                    "registered accounts as of October 2026"
                  ),
                },
                {
                  value: String(INTEGRATION_PROVIDERS.length),
                  label: t("تكامل في الكتالوج، واللي جاهز متعلّم صريح", "integrations in the catalog, live ones labelled plainly"),
                },
                {
                  value: String(SELF_SERVE.size),
                  label: t("ربط ذاتي من داخل التطبيق من غير تدخّل مننا", "self-serve connections, no setup on our side"),
                },
                {
                  value: "0",
                  label: t("شهادات مشتراة أو مكتوبة من الشركة", "paid or company-written testimonials"),
                },
              ].map((stat) => (
                <div className="rounded-xl border p-5" key={stat.label}>
                  <p className="font-semibold text-3xl">{stat.value}</p>
                  <p className="mt-2 text-muted-foreground text-sm">{stat.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              {t(
                "نبني على أدوات مجرّبة: Google (OAuth للدرايف وجيميل) · GitHub · Vercel · Supabase · n8n — وأي شهادة عميل ننشرها لازم تكون باسمه وبموافقته.",
                "Built on tools you already trust: Google (OAuth for Drive and Gmail) · GitHub · Vercel · Supabase · n8n. Any customer quote we publish carries their name and their permission."
              )}
            </p>
          </div>
        </section>

        <section className="border-b" id="plans">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 className="font-semibold text-3xl">
              {t("باقة لكل حجم عمل", "A plan for every size")}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {t(
                "فرد، شركة، مكتب، أو مؤسسة بفروع — الحدود والأعضاء وسجل التدقيق تختلف بوضوح.",
                "Individual, company, office or multi-branch group — limits, seats and audit trail differ clearly."
              )}
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <article
                  className={
                    plan.highlight
                      ? "flex flex-col rounded-xl border-2 border-foreground p-6"
                      : "flex flex-col rounded-xl border p-6"
                  }
                  key={plan.id}
                >
                  <span className="text-xs text-muted-foreground">
                    {plan.tag[lang]}
                  </span>
                  <h3 className="mt-2 font-semibold text-xl">{plan.name[lang]}</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="font-semibold text-3xl">{plan.price[lang]}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period[lang]}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.id === "enterprise"
                      ? t("", "")
                      : t("بالدولار الأمريكي", "USD")}
                  </p>
                  <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs">
                    {plan.note[lang]}
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
            </div>
          </div>
        </section>

        <section className="border-b" id="security">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
            <div>
              <h2 className="font-semibold text-3xl">
                {t("الأمان ليس بندًا في الأسفل", "Security is not a footnote")}
              </h2>
              <p className="mt-3 text-muted-foreground">
                {t(
                  "كل اتصال تكامل يُخزَّن مشفّرًا، مربوطًا بمساحة عمل واحدة، ومُسجَّلًا في سجل تدقيق يمكنك مراجعته. وأنت من يملك القرار في أي إجراء يخص طرفًا خارجيًا.",
                  "Every integration connection is stored encrypted, bound to a single workspace and recorded in an audit trail you can review. You keep the decision on anything that touches an outside party."
                )}
              </p>
            </div>
            <ul className="grid gap-3 text-sm">
              {[
                t("تشفير AES-256-GCM مع نسخ احتياطي للمفتاح", "AES-256-GCM encryption with key versioning"),
                t("عزل صفوف (RLS) لكل مساحة عمل", "Row Level Security per workspace"),
                t("سجل تدقيق لكل ربط وفصل واستخدام", "Audit log for every connect, revoke and use"),
                t("فصل الاتصال في أي لحظة يمحو الرموز", "Disconnecting wipes the stored tokens"),
                t("حدود استهلاك واضحة لكل باقة", "Clear usage limits on every plan"),
              ].map((item) => (
                <li className="rounded-lg border px-4 py-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-b" id="faq">
          <div className="mx-auto w-full max-w-4xl px-5 py-16">
            <h2 className="font-semibold text-3xl">
              {t("أسئلة يسألها الجميع", "Questions everyone asks")}
            </h2>
            <div className="mt-6 flex flex-col gap-3">
              {faqs.map((faq) => (
                <details className="rounded-xl border p-5" key={faq.q.en}>
                  <summary className="cursor-pointer font-medium">
                    {faq.q[lang]}
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {faq.a[lang]}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-20 text-center">
          <h2 className="font-semibold text-3xl">
            {t("جاهز؟ افتح مساحة عملك في دقيقة", "Ready? Open your workspace in a minute")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {t(
              "ابدأ بالمجاني للكتابة. ربط الأدوات ووضع الوكيل يتفعّلان على الاحترافي والأعمال. الباقات تُرقّى من داخل التطبيق متى شئت.",
              "Start on the free plan for writing. Tool connections and Agent mode unlock on Pro and Business. Upgrade from inside the app whenever you like."
            )}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              className="rounded-lg bg-foreground px-6 py-3 font-medium text-background"
              href={CTA.workspace.href}
            >
              {isArabic ? CTA.workspace.ar : CTA.workspace.en}
            </Link>
            <Link className="rounded-lg border px-6 py-3 font-medium" href="/login">
              {t("تسجيل الدخول", "Sign in")}
            </Link>
            <Link className="rounded-lg border px-6 py-3 font-medium" href="/contact">
              {t("تحدث مع الفريق", "Talk to the team")}
            </Link>
          </div>
        </section>
      </main>

      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zooka AI",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://zooka-ai.com",
            inLanguage: ["ar", "en"],
            description:
              "Zooka AI: an AI business agent that connects your tools, executes multi-step tasks and keeps your data isolated per workspace.",
            offers: plans
              .filter((plan) => plan.id !== "enterprise")
              .map((plan) => ({
                "@type": "Offer",
                name: plan.name.en,
                price: plan.price.en,
                priceCurrency: "USD",
              })),
          }),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VideoObject",
            name: t("زوكا AI — فيديو تعريفي", "Zooka AI demo video"),
            description: t(
              "عرض سريع لقدرات زوكا AI: ربط الأدوات، تنفيذ المهام، التكاملات، المحادثة الصوتية والنشر.",
              "A short walkthrough of Zooka AI: connecting tools, multi-step execution, integrations, voice and shipping."
            ),
            thumbnailUrl: "https://zooka-ai.com/images/zooka-demo-poster.png",
            contentUrl: "https://zooka-ai.com/videos/zooka-demo.mp4",
            uploadDate: "2026-10-31",
            duration: "PT28S",
          }),
        }}
        type="application/ld+json"
      />
    </div>
  );
}
