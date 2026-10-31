import Link from "next/link";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import { dirOf, fontOf } from "@/lib/i18n";

type Lang = "ar" | "en";

export const plans = [
  {
    id: "free",
    name: { ar: "مجاني", en: "Free" },
    price: { ar: "0", en: "0" },
    period: { ar: "للأبد", en: "forever" },
    tag: { ar: "للتجربة", en: "Start here" },
    features: {
      ar: [
        "1,000 رسالة شهريًا",
        "النماذج الأساسية",
        "ربط جيميل ودرايف بحسابك",
        "مساحة عمل واحدة",
      ],
      en: [
        "1,000 messages / month",
        "Standard models",
        "Connect your own Gmail & Drive",
        "One workspace",
      ],
    },
    cta: { ar: "ابدأ مجانًا", en: "Start free" },
    href: "/register",
    highlight: false,
  },
  {
    id: "pro",
    name: { ar: "احترافي", en: "Pro" },
    price: { ar: "19", en: "19" },
    period: { ar: "شهريًا", en: "per month" },
    tag: { ar: "للفرد والمستقل", en: "Solo & freelance" },
    features: {
      ar: [
        "10,000 رسالة شهريًا",
        "500 تشغيل وكيل (Agent)",
        "1,000 بحث ويب",
        "النماذج المتقدمة",
        "كل التكاملات المتاحة",
      ],
      en: [
        "10,000 messages / month",
        "500 agent runs",
        "1,000 web searches",
        "Advanced models",
        "Every available integration",
      ],
    },
    cta: { ar: "اختر الاحترافي", en: "Choose Pro" },
    href: "/register?plan=pro",
    highlight: true,
  },
  {
    id: "business",
    name: { ar: "الأعمال", en: "Business" },
    price: { ar: "49", en: "49" },
    period: { ar: "شهريًا", en: "per month" },
    tag: { ar: "للشركات والمكاتب", en: "Companies & offices" },
    features: {
      ar: [
        "100,000 رسالة شهريًا",
        "5,000 تشغيل وكيل",
        "10,000 بحث ويب",
        "مساحات عمل للفريق وأعضاء متعددون",
        "سجل تدقيق للتكاملات",
        "دعم بأولوية",
      ],
      en: [
        "100,000 messages / month",
        "5,000 agent runs",
        "10,000 web searches",
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
      ar: "هل يمكنني الإلغاء أو تغيير الباقة؟",
      en: "Can I change or cancel a plan?",
    },
    a: {
      ar: "نعم، الترقية أو التخفيض أو الإلغاء متاح من صفحة إدارة الاشتراك، وسياسة الاسترداد منشورة على الموقع.",
      en: "Yes. Upgrade, downgrade or cancel from the subscription page, and the refund policy is published on the site.",
    },
  },
];

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
      className="flex min-h-dvh flex-col bg-background text-foreground"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link className="flex items-center gap-2 font-semibold" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Zooka AI"
              className="h-8 w-8 rounded-md"
              src="/images/zooka-logo-120.png"
            />
            <span>Zooka AI</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#capabilities">{t("القدرات", "Capabilities")}</a>
            <a href="#integrations">{t("التكاملات", "Integrations")}</a>
            <a href="#plans">{t("الباقات", "Plans")}</a>
            <a href="#security">{t("الأمان", "Security")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              href="/login"
            >
              {t("تسجيل الدخول", "Sign in")}
            </Link>
            <Link
              className="rounded-md bg-foreground px-4 py-2 font-medium text-background text-sm"
              href="/register"
            >
              {t("ابدأ مجانًا", "Start free")}
            </Link>
          </div>
        </div>
      </header>

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
          <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-20 md:py-28">
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
            <p className="max-w-2xl text-lg text-muted-foreground">
              {t(
                "بريدك، ملفاتك، كودك، بياناتك، وأتمتتك — داخل محادثة واحدة بالعربي والإنجليزي. الوكيل يفتح صفحة الموافقة بنفسه، يربط الحساب، ينفّذ الخطوات، ولا يرجع لك إلا للقرار الحساس.",
                "Your email, files, code, data and automation — inside one conversation in Arabic and English. The agent opens the consent screen itself, connects the account, runs the steps, and only comes back to you for the sensitive decision."
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="rounded-lg bg-foreground px-6 py-3 font-medium text-background"
                href="/register"
              >
                {t("أنشئ مساحة عملك الآن", "Create your workspace")}
              </Link>
              <Link
                className="rounded-lg border px-6 py-3 font-medium"
                href="#plans"
              >
                {t("شاهد الباقات", "See the plans")}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "بدون بطاقة للتجربة · عربي وإنجليزي · 26 تكاملًا في الكتالوج",
                "No card to try · Arabic and English · 26 integrations in the catalog"
              )}
            </p>
          </div>
        </section>

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
            <h2 className="font-semibold text-3xl">
              {t("ماذا ينفّذ فعليًا؟", "What does it actually do?")}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {t(
                "لا نبيع وعودًا: هذه القدرات مبنية ومختبَرة على zooka-ai.com نفسها.",
                "No promises: these capabilities are built and tested on zooka-ai.com itself."
              )}
            </p>
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

        <section className="border-b" id="integrations">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-semibold text-3xl">
                  {t("تكاملات جاهزة الآن", "Integrations live today")}
                </h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  {t(
                    "تربطها من داخل التطبيق بضغطة، والوكيل يستخدمها مباشرة. الباقي في الكتالوج يُفتح تِباعًا بعد موافقات المزوّد.",
                    "Connect them inside the app in one click and the agent uses them straight away. The rest open up as provider approvals land."
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
                          {t("متاح", "available")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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

        <section className="border-b">
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
              "ابدأ بالمجاني، اربط حسابك، وأعطِ الوكيل أول مهمة. الباقات تُرقّى من داخل التطبيق متى شئت.",
              "Start free, connect your account, give the agent its first task. Upgrade from inside the app whenever you like."
            )}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              className="rounded-lg bg-foreground px-6 py-3 font-medium text-background"
              href="/register"
            >
              {t("ابدأ مجانًا", "Start free")}
            </Link>
            <Link className="rounded-lg border px-6 py-3 font-medium" href="/contact">
              {t("تحدث مع الفريق", "Talk to the team")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Zooka AI</p>
          <nav className="flex flex-wrap gap-5">
            <Link href="/about">{t("من نحن", "About")}</Link>
            <Link href="/privacy">{t("سياسة الخصوصية", "Privacy")}</Link>
            <Link href="/terms">{t("شروط الخدمة", "Terms")}</Link>
            <Link href="/refund">{t("سياسة الاسترداد", "Refunds")}</Link>
            <Link href="/contact">{t("تواصل معنا", "Contact")}</Link>
          </nav>
        </div>
      </footer>

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
    </div>
  );
}
