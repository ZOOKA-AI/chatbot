import {
  Bot,
  Code2,
  Globe,
  Layers,
  MessageSquareText,
  PlayCircle,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { BrandIntro } from "@/components/marketing/brand-intro";
import { DemoChat } from "@/components/marketing/demo-chat";
import {
  Compare,
  HowItWorks,
  PostersSection,
  UseCases,
  VideoSection,
} from "@/components/marketing/showcase";
import { SiteHeader } from "@/components/marketing/site-header";
import { TaskTemplates } from "@/components/marketing/task-templates";
import { SocialIconRow } from "@/components/social-icon-row";
import { VideoStream } from "@/components/tv/video-stream";
import { planFeatures } from "@/lib/billing/entitlements";
import { dirOf, fontOf } from "@/lib/i18n";
import {
  getIntegrationProviders,
  isWhatsAppConfigured,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import { CTA } from "@/lib/marketing/cta";
import { SITE_URL } from "@/lib/site";
import { visibleVideos } from "@/lib/tv/videos";

type Lang = "ar" | "en";

export const plans = [
  {
    id: "free",
    note: {
      ar: "كتابة وتوليد داخل المحادثة. لا ربط أدوات ولا وضع وكيل.",
      en: "Writing and drafting in chat. No tool connections, no agent mode.",
    },
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
    note: {
      ar: "كل التكاملات المتاحة + وضع الوكيل حتى إنجاز المهمة.",
      en: "All live integrations + agent mode that runs the task to the end.",
    },
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
    note: {
      ar: "نفس الاحترافي + فريق وسجل تدقيق ودعم بأولوية.",
      en: "Everything in Pro + team seats, audit log and priority support.",
    },
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
    note: {
      ar: "فروع متعددة، اتفاقية خدمة، وتسعير بحسب الاستخدام.",
      en: "Multiple branches, service agreement, usage-based pricing.",
    },
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

const heroFeatures = [
  {
    icon: MessageSquareText,
    href: "/#demo",
    title: { ar: "المساعد الذكي", en: "Smart assistant" },
    body: {
      ar: "محادثة تكتب وتلخّص وتجهّز الردود",
      en: "Chat that writes, summarises and drafts replies",
    },
  },
  {
    icon: Bot,
    href: "/lp/agents",
    title: { ar: "وكلاء AI", en: "AI agents" },
    body: {
      ar: "خطوات متعددة حتى إنجاز المهمة",
      en: "Multi-step work until the task is done",
    },
  },
  {
    icon: Globe,
    href: "/#capabilities",
    title: { ar: "متصفح الوكيل", en: "Agent browser" },
    body: {
      ar: "يفتح الصفحات وينفّذ أمامك",
      en: "Opens pages and works in front of you",
    },
  },
  {
    icon: Layers,
    href: "/studio",
    title: { ar: "الاستوديو", en: "Studio" },
    body: {
      ar: "محتوى وتصاميم من داخل المنصة",
      en: "Content and designs inside the platform",
    },
  },
  {
    icon: Zap,
    href: "/#integrations",
    title: { ar: "الأتمتة", en: "Automation" },
    body: {
      ar: "جدولة وسير عمل n8n الخاص بك",
      en: "Schedules and your own n8n workflows",
    },
  },
  {
    icon: Code2,
    href: "/developer",
    title: { ar: "MCP للمطورين", en: "MCP for developers" },
    body: {
      ar: "اربط أدواتك عبر خادم MCP",
      en: "Connect your tools through the MCP server",
    },
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
      ar: "لا. كل جدول مرتبط بمساحة عمل، وكل طلب يُفلتر حسب مساحة العمل في الخادم بعد التحقق من الصلاحية، فلا يرى أي عضو بيانات مساحة أخرى.",
      en: "No. Every table is scoped to a workspace, and every request is filtered by workspace on the server after an access check, so a member cannot see another workspace's data.",
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
  "instagram",
  "meta",
  "linkedin",
  "snapchat",
  "telegram_ads",
  "telegram_bot",
  "improvmx",
  "google_ads",
  "github",
  "vercel",
  "n8n",
]);

export function LandingPage({ lang }: { lang: Lang }) {
  const INTEGRATION_PROVIDERS = getIntegrationProviders(
    isWhatsAppConfigured(process.env)
  );
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
      className="dark zk-brand bg-background text-foreground flex min-h-dvh flex-col"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <SiteHeader lang={lang} />

      <main className="flex-1">
        <section className="zk-brand-bg relative overflow-hidden">
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-7 px-5 pt-14 pb-10 text-center md:pt-20">
            <span className="zk-kicker">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[#24D6E6] shadow-[0_0_10px_#24D6E6]"
              />
              {t(
                "وكيل أعمال يعمل نيابةً عنك — لا مجرد محادثة",
                "A business agent that works for you — not just a chat"
              )}
            </span>
            <h1 className="max-w-4xl text-4xl leading-[1.25] font-bold text-balance md:text-6xl">
              {t("ذكاء اصطناعي يعمل معك، ", "AI that works with you, ")}
              <br className="hidden sm:block" />
              <span className="zk-gradient-text">
                {t("وينجز عنك", "and gets it done for you")}
              </span>
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg text-balance">
              {t(
                "ردود عملائك وفواتيرك ومتابعة طلباتك من محادثة واحدة. تربط جيميل ودرايف بحسابك، والوكيل ينفّذ الخطوات بنفسه ويوريك الناتج قبل ما ترسله.",
                "Customer replies, invoices and follow-ups from one chat. Connect your own Gmail and Drive, and the agent runs the steps and shows you the output before you send it."
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link className="zk-btn-primary px-7" href={CTA.workspace.href}>
                <Sparkles aria-hidden="true" className="size-4" />
                {isArabic ? CTA.workspace.ar : CTA.workspace.en}
              </Link>
              <a className="zk-btn-ghost px-7" href={CTA.demo.href}>
                <PlayCircle aria-hidden="true" className="size-4" />
                {isArabic ? CTA.demo.ar : CTA.demo.en}
              </a>
            </div>
            <p className="text-muted-foreground text-sm">
              {t(
                "10 رسائل مجانية كل يوم · كتابة فقط، بدون فتح بريدك أو ملفاتك · ",
                "10 free messages a day · writing only, we never open your mail or files · "
              )}
              <Link
                className="text-[#8fb2ff] underline-offset-4 hover:underline"
                href="/pricing"
              >
                {t(
                  "ربط الأدوات ووضع الوكيل من الاحترافي — 19$ شهريًا",
                  "Tool connections and Agent mode on Pro — $19 a month"
                )}
              </Link>
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-6xl px-5 pb-6">
            <div className="zk-frame relative grid items-stretch gap-0 overflow-hidden p-2 md:p-3 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative z-10">
                <DemoChat lang={lang} />
              </div>
              <div className="relative hidden flex-col items-center overflow-hidden lg:flex">
                <span
                  aria-hidden="true"
                  className="zk-orbit inset-x-6 top-[22%] h-[52%]"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={t(
                    "شخصية زوكا AI الروبوتية — رسم توضيحي للعلامة وليس الشعار",
                    "The ZOOKA-AI robot character — a brand illustration, not the logo"
                  )}
                  className="zk-mascot relative -mt-10 aspect-[4/3] w-full self-start object-cover"
                  decoding="async"
                  fetchPriority="high"
                  height={675}
                  src="/images/zooka-mascot.webp"
                  width={1200}
                />
                <div className="absolute inset-x-6 bottom-6 flex flex-col gap-2 text-start">
                  {[
                    t(
                      "يقرأ طلبك ويخطط الخطوات",
                      "Reads your request and plans the steps"
                    ),
                    t(
                      "ينفّذ على أدواتك المربوطة",
                      "Runs them on your connected tools"
                    ),
                    t(
                      "ينتظر موافقتك قبل أي إرسال",
                      "Waits for your approval before sending"
                    ),
                  ].map((step, index) => (
                    <div
                      className="zk-card flex items-center gap-3 px-3 py-2 text-sm"
                      key={step}
                    >
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#8058F5]/30 text-xs font-semibold text-[#cfc4ff]">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-6xl px-5 pt-4 pb-16">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {heroFeatures.map((feature) => (
                <li key={feature.href}>
                  <Link
                    className="zk-card zk-card-hover flex h-full flex-col items-center gap-2 px-3 py-4 text-center"
                    href={feature.href}
                  >
                    <span className="zk-icon-tile">
                      <feature.icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="text-sm font-semibold">
                      {feature.title[lang]}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {feature.body[lang]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div aria-hidden="true" className="zk-section-divider" />

        <section className="border-b" id="brand">
          <div className="mx-auto w-full max-w-6xl px-5 py-14">
            <BrandIntro lang={lang} />
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
              <div className="zk-card p-5" key={card.title}>
                <span className="text-xs tracking-widest text-[#8fb2ff] uppercase">
                  {card.kicker}
                </span>
                <h3 className="mt-2 font-medium">{card.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {card.body}
                </p>
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
              <div className="zk-card p-6" key={item.title}>
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b" id="capabilities">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="grid items-center gap-8 md:grid-cols-[1fr_280px]">
              <div>
                <h2 className="text-3xl font-semibold">
                  {t("ماذا ينفّذ فعليًا؟", "What does it actually do?")}
                </h2>
                <p className="text-muted-foreground mt-3 max-w-2xl">
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
                  className="zk-card zk-card-hover p-6"
                  key={capability.title.en}
                >
                  <h3 className="font-medium">{capability.title[lang]}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">
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
                <h2 className="text-3xl font-semibold">
                  {t(
                    "التكاملات اللي تربطها بنفسك",
                    "Integrations you connect yourself"
                  )}
                </h2>
                <p className="text-muted-foreground mt-3 max-w-2xl">
                  {t(
                    `ما بنعلن عن أي تكامل كـ«متصل» قبل ما تربطه بنفسك من صفحة التكاملات. الربط الذاتي متاح فعليًا لثلاثة عشر: جوجل درايف، جيميل، إنستغرام، فيسبوك، لينكدإن، سناب شات، تيليجرام أدز، بوت تيليجرام، توجيه البريد، إعلانات جوجل، جيت هب، فيرسل، وn8n (جيت هب: الوكيل يقرأ ويكتب بعد موافقتك. فيرسل: ربط الحساب الآن، وإجراءات الوكيل قادمة). وباقي الكتالوج (${INTEGRATION_PROVIDERS.length - SELF_SERVE.size} من ${INTEGRATION_PROVIDERS.length}) ينتظر موافقة المزوّد أو يعمل عبر جسر الوكيل — بنكتبها صريحة بدل ما نوعد بربط بضغطة لكل حاجة.`,
                    `Nothing is shown as "connected" before you connect it yourself from the integrations page. Self-serve is live for thirteen: Google Drive, Gmail, Instagram, Facebook, LinkedIn, Snapchat, Telegram Ads, Telegram Bot, ImprovMX email routing, Google Ads, GitHub, Vercel and n8n (GitHub: the agent reads and writes after your approval. Vercel: account connection today, agent actions coming). The rest of the catalog (${INTEGRATION_PROVIDERS.length - SELF_SERVE.size} of ${INTEGRATION_PROVIDERS.length}) waits on provider approval or runs through the agent bridge or waits on provider approval — stated plainly instead of promising one-click for everything.`
                  )}
                </p>
              </div>
              <Link className="text-sm underline" href="/login">
                {t("اربط حسابك", "Connect your account")}
              </Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(grouped).map(([category, items]) => (
                <div className="zk-card p-5" key={category}>
                  <h3 className="text-muted-foreground text-sm">
                    {isArabic
                      ? PROVIDER_CATEGORIES[category]?.ar
                      : PROVIDER_CATEGORIES[category]?.en}
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {items.map((provider) => (
                      <li
                        className="flex items-center justify-between gap-2"
                        key={provider.id}
                      >
                        <span>
                          {isArabic ? provider.nameAr : provider.name}
                        </span>
                        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
                          {SELF_SERVE.has(provider.id)
                            ? t("تربطه بنفسك", "you connect it")
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

        <section className="border-b" id="tv">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-16">
            <div className="flex flex-col gap-2">
              <span className="text-xs tracking-widest text-[#8fb2ff] uppercase">
                ZOOKA AI TV
              </span>
              <h2 className="text-3xl font-semibold">
                {t("شاهد المنصة وهي تعمل", "Watch the platform at work")}
              </h2>
              <p className="text-muted-foreground max-w-2xl">
                {t(
                  "فيديوهات من إنتاجنا تعرض ما هو موجود فعلًا في المنتج. لا تشغيل تلقائي للصوت.",
                  "Videos we produced that show what actually exists in the product. Nothing plays sound on its own."
                )}
              </p>
            </div>
            <VideoStream lang={lang} videos={visibleVideos()} />
            <div className="zk-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {t(
                    "تابع ZOOKA-AI على الحسابات الرسمية",
                    "Follow ZOOKA-AI on the official accounts"
                  )}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t(
                    "تظهر هنا الحسابات الموثّقة فقط؛ الحسابات قيد المراجعة تبقى في صفحة الحسابات الرسمية بدون رابط.",
                    "Only verified accounts appear here; accounts under review stay on the official accounts page without a link."
                  )}
                </p>
              </div>
              <SocialIconRow
                ids={[
                  "x",
                  "youtube",
                  "tiktok",
                  "linkedin",
                  "telegram",
                  "facebook",
                  "discord",
                  "github",
                  "bluesky",
                  "pinterest",
                ]}
                lang={lang}
                size="sm"
              />
            </div>
          </div>
        </section>

        <section className="border-b" id="proof">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <span className="text-xs tracking-widest text-[#8fb2ff] uppercase">
              {t("أرقام حقيقية", "Real numbers")}
            </span>
            <h2 className="mt-2 text-3xl font-semibold">
              {t(
                "أرقام نقدر نثبتها، لا شعارات",
                "Numbers we can prove, not badges"
              )}
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl">
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
                  value: String(
                    INTEGRATION_PROVIDERS.filter(
                      (provider) => provider.status === "available"
                    ).length
                  ),
                  label: t(
                    `تكامل جاهز فعلاً من ${INTEGRATION_PROVIDERS.length} في الكتالوج، والباقي معلّم «قريباً» أو «تجريبي»`,
                    `integrations live today, out of ${INTEGRATION_PROVIDERS.length} in the catalog; the rest are labelled coming soon or beta`
                  ),
                },
                {
                  value: String(SELF_SERVE.size),
                  label: t(
                    "ربط ذاتي من داخل التطبيق من غير تدخّل مننا",
                    "self-serve connections, no setup on our side"
                  ),
                },
                {
                  value: "0",
                  label: t(
                    "شهادات مشتراة أو مكتوبة من الشركة",
                    "paid or company-written testimonials"
                  ),
                },
              ].map((stat) => (
                <div className="zk-card p-5" key={stat.label}>
                  <p className="text-3xl font-semibold">{stat.value}</p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-6 text-sm">
              {t(
                "نبني على أدوات مجرّبة: Google (OAuth للدرايف وجيميل) · GitHub · Vercel · Supabase · n8n — وأي شهادة عميل ننشرها لازم تكون باسمه وبموافقته.",
                "Built on tools you already trust: Google (OAuth for Drive and Gmail) · GitHub · Vercel · Supabase · n8n. Any customer quote we publish carries their name and their permission."
              )}
            </p>
          </div>
        </section>

        <section className="border-b" id="plans">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 className="text-3xl font-semibold">
              {t("باقة لكل حجم عمل", "A plan for every size")}
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl">
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
                      ? "zk-card flex flex-col border-[#8058F5]/70 p-6 shadow-[0_0_40px_-12px_rgba(128,88,245,0.8)]"
                      : "zk-card flex flex-col p-6"
                  }
                  key={plan.id}
                >
                  <span className="text-muted-foreground text-xs">
                    {plan.tag[lang]}
                  </span>
                  <h3 className="mt-2 text-xl font-semibold">
                    {plan.name[lang]}
                  </h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">
                      {plan.price[lang]}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {plan.period[lang]}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {plan.id === "enterprise"
                      ? t("", "")
                      : t("بالدولار الأمريكي", "USD")}
                  </p>
                  <p className="text-muted-foreground mt-3 rounded-lg border border-dashed px-3 py-2 text-xs">
                    {plan.note[lang]}
                  </p>
                  <ul className="text-muted-foreground mt-4 flex flex-1 flex-col gap-2 text-sm">
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
                        ? "zk-btn-primary mt-5 text-sm"
                        : "zk-btn-ghost mt-5 text-sm"
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
              <h2 className="text-3xl font-semibold">
                {t("الأمان ليس بندًا في الأسفل", "Security is not a footnote")}
              </h2>
              <p className="text-muted-foreground mt-3">
                {t(
                  "كل اتصال تكامل يُخزَّن مشفّرًا، مربوطًا بمساحة عمل واحدة، ومُسجَّلًا في سجل تدقيق يمكنك مراجعته. وأنت من يملك القرار في أي إجراء يخص طرفًا خارجيًا.",
                  "Every integration connection is stored encrypted, bound to a single workspace and recorded in an audit trail you can review. You keep the decision on anything that touches an outside party."
                )}
              </p>
            </div>
            <ul className="grid gap-3 text-sm">
              {[
                t(
                  "تشفير AES-256-GCM مع نسخ احتياطي للمفتاح",
                  "AES-256-GCM encryption with key versioning"
                ),
                t(
                  "عزل البيانات لكل مساحة عمل على مستوى الخادم",
                  "Server-enforced data isolation per workspace"
                ),
                t(
                  "سجل تدقيق لكل ربط وفصل واستخدام",
                  "Audit log for every connect, revoke and use"
                ),
                t(
                  "فصل الاتصال في أي لحظة يمحو الرموز",
                  "Disconnecting wipes the stored tokens"
                ),
                t(
                  "حدود استهلاك واضحة لكل باقة",
                  "Clear usage limits on every plan"
                ),
              ].map((item) => (
                <li className="zk-card px-4 py-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-b" id="faq">
          <div className="mx-auto w-full max-w-4xl px-5 py-16">
            <h2 className="text-3xl font-semibold">
              {t("أسئلة يسألها الجميع", "Questions everyone asks")}
            </h2>
            <div className="mt-6 flex flex-col gap-3">
              {faqs.map((faq) => (
                <details className="zk-card p-5" key={faq.q.en}>
                  <summary className="cursor-pointer font-medium">
                    {faq.q[lang]}
                  </summary>
                  <p className="text-muted-foreground mt-3 text-sm">
                    {faq.a[lang]}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-20">
          <div className="zk-frame zk-brand-bg relative overflow-hidden px-6 py-14 text-center">
            <h2 className="text-3xl font-semibold">
              {t(
                "جاهز؟ افتح مساحة عملك في دقيقة",
                "Ready? Open your workspace in a minute"
              )}
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
              {t(
                "ابدأ بالمجاني للكتابة. ربط الأدوات ووضع الوكيل يتفعّلان على الاحترافي والأعمال. الباقات تُرقّى من داخل التطبيق متى شئت.",
                "Start on the free plan for writing. Tool connections and Agent mode unlock on Pro and Business. Upgrade from inside the app whenever you like."
              )}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link className="zk-btn-primary px-7" href={CTA.workspace.href}>
                {isArabic ? CTA.workspace.ar : CTA.workspace.en}
              </Link>
              <Link className="zk-btn-ghost px-7" href="/login">
                {t("تسجيل الدخول", "Sign in")}
              </Link>
              <Link className="zk-btn-ghost px-7" href="/contact">
                {t("تحدث مع الفريق", "Talk to the team")}
              </Link>
            </div>
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
            url: SITE_URL,
            publisher: { "@id": `${SITE_URL}/#organization` },
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
