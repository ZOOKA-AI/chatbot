import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/developer` },
  description:
    "من يبني Zooka AI: مطوّر في Google Developer Program وGoogle Cloud Innovator، مع خلفية في Android والذكاء الاصطناعي والبنية السحابية والوكلاء. Meet the developer behind Zooka AI.",
  keywords: [
    "Zooka AI developer",
    "Google Developer Program",
    "Google Cloud Innovator",
    "مطور ذكاء اصطناعي الإمارات",
    "Android developer UAE",
    "AI agent Arabic",
  ],
  openGraph: {
    description:
      "مطوّر في Google Developer Program وGoogle Cloud Innovator — بناء وكلاء عرب ينفّذون المهام على أدوات الشركة.",
    title: "المطوّر وراء Zooka AI",
    type: "profile",
  },
  title: "المطوّر وراء Zooka AI",
};

const PAGE_URL = `${SITE_URL}/developer`;

const personSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Zooka AI",
      url: SITE_URL,
      logo: `${SITE_URL}/images/zooka-logo-512.png`,
      sameAs: [
        "https://github.com/ZOOKA-AI",
        "https://g.dev/zooka-ai",
        "https://developers.google.com/profile/u/zooka-ai",
      ],
    },
    {
      "@type": "Person",
      "@id": `${PAGE_URL}#developer`,
      name: "Haroon",
      alternateName: ["helmyharoon8", "ZOOKA-AI"],
      jobTitle: "Developer at AI",
      description:
        "أبني وكلاء عرباً ينفّذون المهام على أدوات الشركة: بريد، ملفات، نشر، وأتمتة.",
      url: PAGE_URL,
      image: `${SITE_URL}/images/zooka-logo-512.png`,
      address: {
        "@type": "PostalAddress",
        addressLocality: "رأس الخيمة",
        addressRegion: "إمارة رأس الخيمة",
        addressCountry: "AE",
      },
      knowsAbout: [
        "Android",
        "Artificial Intelligence",
        "Machine Learning",
        "Google Cloud",
        "Automation",
        "Multi-agent systems",
      ],
      sameAs: [
        "https://g.dev/zooka-ai",
        "https://developers.google.com/profile/u/zooka-ai",
        "https://github.com/ZOOKA-AI",
        "https://github.com/ZOOKA-AI/chatbot",
      ],
      worksFor: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

const BADGES = [
  {
    ar: "Google Developer Program",
    en: "Google Developer Program",
    note: { ar: "عضو منذ 2 نوفمبر 2025", en: "Member since 2 Nov 2025" },
    tone: "from-sky-500/15 to-sky-500/0",
  },
  {
    ar: "Google Cloud Innovator",
    en: "Google Cloud Innovator",
    note: { ar: "مُنحت في 9 نوفمبر 2025", en: "Awarded 9 Nov 2025" },
    tone: "from-emerald-500/15 to-emerald-500/0",
  },
  {
    ar: "The Android Show · Fall 2025",
    en: "The Android Show · Fall 2025",
    note: { ar: "حضور 4 نوفمبر 2025", en: "Attended 4 Nov 2025" },
    tone: "from-lime-500/15 to-lime-500/0",
  },
  {
    ar: "تعلّم مستمر",
    en: "Always learning",
    note: { ar: "مسار تعلّم نشط حتى 2026", en: "Active learning path through 2026" },
    tone: "from-amber-500/15 to-amber-500/0",
  },
] as const;

const FOCUS = [
  {
    ar: "الذكاء الاصطناعي والوكلاء",
    en: "AI and agents",
    body: {
      ar: "بناء وكلاء متعددو الخطوات: تخطيط، تنفيذ أدوات، ثم مراجعة الناتج قبل أي إرسال.",
      en: "Multi-step agents: plan, call tools, then review the result before anything is sent.",
    },
  },
  {
    ar: "Android",
    en: "Android",
    body: {
      ar: "تجربة تطبيقات أندرويد حديثة، وإدماج الذكاء في الواجهات اليومية.",
      en: "Modern Android app craft and bringing AI into everyday interfaces.",
    },
  },
  {
    ar: "السحابة والبنية التحتية",
    en: "Cloud and infrastructure",
    body: {
      ar: "Google Cloud وAlloyDB وFirebase، مع قياس استهلاك دقيق لكل عملية.",
      en: "Google Cloud, AlloyDB and Firebase, with metering on every operation.",
    },
  },
  {
    ar: "الأتمتة والمحتوى",
    en: "Automation and content",
    body: {
      ar: "ربط البريد والملفات والنشر في مسار واحد بدل عشر أدوات منفصلة.",
      en: "Email, files and publishing in one flow instead of ten separate tools.",
    },
  },
] as const;

const BUILT = [
  {
    ar: "وكيل ينفّذ لا يكتفي بالكتابة",
    en: "An agent that executes, not just writes",
  },
  {
    ar: "وضع الوكيل بخطوات متعددة على الأدوات المربوطة",
    en: "Agent mode with multi-step runs on connected tools",
  },
  {
    ar: "قياس توكنز موزون لكل مساحة عمل بهامش محفوظ",
    en: "Weighted token metering per workspace with protected margin",
  },
  {
    ar: "نشر إلى Vercel وربط نطاقات من داخل المحادثة",
    en: "Deploy to Vercel and attach domains from inside the chat",
  },
] as const;

export default function DeveloperPage() {
  // getLang reads a cookie, so the shell stays static and the content streams.
  return (
    <Suspense fallback={null}>
      <DeveloperContent />
    </Suspense>
  );
}

async function DeveloperContent() {
  const lang = await getLang();
  const ar = lang === "ar";

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-12 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        type="application/ld+json"
      />

      <div className="flex items-center justify-between">
        <Link className="text-muted-foreground text-sm hover:underline" href="/">
          ← ZOOKA AI
        </Link>
        <LanguageToggle lang={lang} />
      </div>

      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10 p-8 sm:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:28px_28px]"
        />
        <p className="relative font-medium text-emerald-600 text-xs uppercase tracking-[0.18em] dark:text-emerald-400">
          {ar ? "من يبني المنتج" : "Who builds this"}
        </p>
        <h1 className="relative mt-3 font-semibold text-3xl leading-tight sm:text-5xl">
          {ar ? "المطوّر وراء Zooka AI" : "The developer behind Zooka AI"}
        </h1>
        <p className="relative mt-4 max-w-2xl text-muted-foreground">
          {ar
            ? "helmyharoon8 — مطوّر في Google Developer Program وGoogle Cloud Innovator. أبني وكلاء عرباً ينفّذون العمل فعلاً على أدوات الشركة، لا مجرد محادثة."
            : "helmyharoon8 — a Google Developer Program member and Google Cloud Innovator, building Arabic agents that actually act on a company's tools instead of only chatting."}
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <a
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 font-medium text-background text-sm"
            href="https://g.dev/zooka-ai"
            rel="me noopener"
            target="_blank"
          >
            {ar ? "ملف مطوّر جوجل" : "Google developer profile"}
          </a>
          <a
            className="inline-flex h-10 items-center rounded-full border px-5 font-medium text-sm hover:bg-accent"
            href="https://github.com/ZOOKA-AI"
            rel="me noopener"
            target="_blank"
          >
            GitHub
          </a>
        </div>
        <p className="relative mt-3 text-muted-foreground text-xs">
          {ar
            ? "المعرض الرسمي يستخدم حساب Google، وروابط البريد والتواصل في صفحة الاتصال."
            : "The official profile lives on a Google account; contact routes are on the contact page."}
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">
          {ar ? "شارات وإنجازات" : "Badges and milestones"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {BADGES.map((badge) => (
            <div
              className={`rounded-2xl border bg-gradient-to-br ${badge.tone} p-5`}
              key={badge.en}
            >
              <p className="font-medium">{ar ? badge.ar : badge.en}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {ar ? badge.note.ar : badge.note.en}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">
          {ar ? "مجالات العمل" : "Where the work happens"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FOCUS.map((item) => (
            <div className="rounded-2xl border p-5" key={item.en}>
              <p className="font-medium">{ar ? item.ar : item.en}</p>
              <p className="mt-2 text-muted-foreground text-sm">
                {ar ? item.body.ar : item.body.en}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">
          {ar ? "ما بُني هنا" : "What was built here"}
        </h2>
        <ul className="flex flex-col gap-3">
          {BUILT.map((item) => (
            <li
              className="flex items-start gap-3 rounded-xl border p-4 text-sm"
              key={item.en}
            >
              <span aria-hidden="true" className="mt-0.5 text-emerald-500">
                ✓
              </span>
              <span>{ar ? item.ar : item.en}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border bg-muted/30 p-8">
        <h2 className="font-semibold text-xl">
          {ar ? "ابدأ من هنا" : "Start here"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {ar
            ? "جرّب الوكيل مجاناً بدون حساب، أو اقرأ ما يفعله فعلاً مقابل المساعدات العامة."
            : "Try the agent free without an account, or read how it differs from general assistants."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 font-medium text-background text-sm"
            href="/"
          >
            {ar ? "جرّب زوكا" : "Try Zooka"}
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-full border px-5 font-medium text-sm hover:bg-accent"
            href="/compare/chatgpt"
          >
            {ar ? "زوكا مقابل ChatGPT" : "Zooka vs ChatGPT"}
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-full border px-5 font-medium text-sm hover:bg-accent"
            href="/contact"
          >
            {ar ? "تواصل معنا" : "Contact"}
          </Link>
        </div>
      </section>
    </main>
  );
}
