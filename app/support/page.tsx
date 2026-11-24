import {
  Bug,
  CreditCard,
  Gauge,
  Github,
  KeyRound,
  Lightbulb,
  Mail,
  MessageCircle,
  Plug,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SocialIconRow } from "@/components/social-icon-row";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import {
  bugReportMailto,
  featureRequestMailto,
  GENERAL_EMAIL,
  HELP_TOPICS,
  REPO_ISSUES,
  SUPPORT_EMAIL,
  SUPPORT_FAQ,
} from "@/lib/support/content";

export const metadata: Metadata = {
  title: "مركز الدعم — ZOOKA-AI",
  description:
    "مركز مساعدة ZOOKA-AI: الأسئلة الشائعة، مساعدة الحساب والفوترة والتكاملات وMCP والأمان، والتواصل مع الدعم. ZOOKA-AI Help Center.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "مركز الدعم — ZOOKA-AI",
    description: "الأسئلة الشائعة، أدلة المساعدة، والتواصل مع فريق الدعم.",
    url: `${SITE_URL}/support`,
    type: "website",
  },
};

const ICONS: Record<string, typeof UserRound> = {
  account: UserRound,
  billing: CreditCard,
  integrations: Plug,
  developers: KeyRound,
  security: ShieldCheck,
  usage: Gauge,
};

const SUPPORT_PROMPTS = [
  {
    ar: "اشرح لي كيف أربط Gmail بمساحة عملي",
    en: "Explain how to connect Gmail to my workspace",
  },
  {
    ar: "كيف أستخدم وضع الوكيل لتنفيذ مهمة؟",
    en: "How do I use agent mode to run a task?",
  },
  {
    ar: "ظهر لي خطأ عند الربط، ما الخطوات التي أجربها؟",
    en: "I got an error while connecting; what should I try?",
  },
];

export default function SupportPage() {
  // getLang reads a cookie, so the shell stays static and the content streams.
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}

async function SupportContent() {
  const lang = await getLang();
  const ar = lang === "ar";
  const l = (value: { ar: string; en: string }) => value[lang];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SUPPORT_FAQ.map((item) => ({
      "@type": "Question",
      name: item.q[lang],
      acceptedAnswer: { "@type": "Answer", text: item.a[lang] },
    })),
  };

  return (
    <div dir={dirOf(lang)} lang={lang} style={{ fontFamily: fontOf(lang) }}>
      <SiteHeader lang={lang} />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        type="application/ld+json"
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-12">
        <header className="flex flex-col gap-3">
          <span className="border-border text-muted-foreground w-fit rounded-full border px-3 py-1 font-mono text-xs tracking-[0.18em]">
            HELP CENTER
          </span>
          <h1 className="text-3xl font-semibold md:text-4xl">
            {ar ? "كيف نساعدك؟" : "How can we help?"}
          </h1>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            {ar
              ? "إجابات مباشرة من المنتج كما هو اليوم، وطرق واضحة للتواصل. الدعم يتم بالبريد الإلكتروني وفي أوقات العمل، وليس دعمًا مباشرًا على مدار الساعة."
              : "Straight answers from the product as it is today, and clear ways to reach us. Support is by email during working hours, not a live 24/7 channel."}
          </p>
          <nav
            aria-label={ar ? "أقسام الصفحة" : "On this page"}
            className="flex flex-wrap gap-2 pt-2 text-sm"
          >
            {[
              ["#topics", ar ? "أدلة المساعدة" : "Help topics"],
              ["#faq", ar ? "الأسئلة الشائعة" : "FAQ"],
              ["#assistant", ar ? "مساعد الدعم" : "Support assistant"],
              ["#contact", ar ? "تواصل مع الدعم" : "Contact support"],
            ].map(([href, label]) => (
              <a
                className="border-border hover:bg-muted inline-flex min-h-10 items-center rounded-full border px-4 transition-colors"
                href={href}
                key={href}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <section
          aria-labelledby="topics-title"
          className="flex flex-col gap-5"
          id="topics"
        >
          <h2 className="text-2xl font-semibold" id="topics-title">
            {ar ? "أدلة المساعدة" : "Help topics"}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_TOPICS.map((topic) => {
              const Icon = ICONS[topic.id] ?? MessageCircle;
              return (
                <li
                  className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5"
                  id={`help-${topic.id}`}
                  key={topic.id}
                >
                  <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-lg font-medium">{l(topic.title)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {l(topic.body)}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-1 text-sm">
                    {topic.links.map((link) =>
                      link.href.startsWith("http") ? (
                        <a
                          className="text-primary inline-flex min-h-8 items-center underline-offset-4 hover:underline"
                          href={link.href}
                          key={link.href}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {l(link.label)}
                        </a>
                      ) : (
                        <Link
                          className="text-primary inline-flex min-h-8 items-center underline-offset-4 hover:underline"
                          href={link.href}
                          key={link.href}
                        >
                          {l(link.label)}
                        </Link>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="faq-title"
          className="flex flex-col gap-5"
          id="faq"
        >
          <h2 className="text-2xl font-semibold" id="faq-title">
            {ar ? "الأسئلة الشائعة" : "Frequently asked questions"}
          </h2>
          <div className="flex flex-col gap-3">
            {SUPPORT_FAQ.map((item) => (
              <details
                className="group border-border bg-card open:border-primary/40 rounded-xl border p-5"
                key={item.q.en}
              >
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q[lang]}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground pt-3 text-sm leading-relaxed">
                  {item.a[lang]}
                  {item.href ? (
                    <>
                      {" "}
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={item.href}
                      >
                        {ar ? "افتح الصفحة" : "Open the page"}
                      </Link>
                    </>
                  ) : null}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="assistant-title"
          className="border-border from-primary/10 flex flex-col gap-4 rounded-2xl border bg-gradient-to-br via-transparent to-transparent p-6"
          id="assistant"
        >
          <h2 className="text-2xl font-semibold" id="assistant-title">
            ZOOKA Support AI
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {ar
              ? "اسأل المساعد داخل المحادثة عن طريقة استخدام المنصة أو خطوات حل مشكلة. يعمل داخل حسابك فقط ولا يطّلع على بيانات أي مستخدم آخر. للمشاكل التي تحتاج تدخل الفريق راسل الدعم بالبريد."
              : "Ask the assistant in chat how to use the platform or how to fix a problem. It works inside your own account only and never sees another user's data. For anything that needs the team, email support."}
          </p>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {SUPPORT_PROMPTS.map((prompt) => (
              <li key={prompt.en}>
                <Link
                  className="border-border bg-background hover:border-primary/60 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm transition-colors"
                  href={`/?query=${encodeURIComponent(prompt[lang])}`}
                >
                  <MessageCircle
                    aria-hidden="true"
                    className="text-primary size-4"
                  />
                  {prompt[lang]}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {ar
              ? "يتطلب تسجيل الدخول. الزائر بدون حساب يرى التجربة المجانية في الصفحة الرئيسية."
              : "Requires signing in. Visitors without an account see the free demo on the home page."}
          </p>
        </section>

        <section
          aria-labelledby="contact-title"
          className="flex flex-col gap-5"
          id="contact"
        >
          <h2 className="text-2xl font-semibold" id="contact-title">
            {ar ? "تواصل مع الدعم" : "Contact support"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ContactCard
              body={
                ar
                  ? "مشاكل الحساب، الفوترة، التكاملات، والأعطال."
                  : "Account, billing, integration and technical problems."
              }
              href={`mailto:${SUPPORT_EMAIL}`}
              icon={<Mail aria-hidden="true" className="size-5" />}
              title={ar ? "الدعم الفني" : "Technical support"}
              value={SUPPORT_EMAIL}
            />
            <ContactCard
              body={
                ar
                  ? "الشراكات، الشركات، والاستفسارات العامة."
                  : "Partnerships, companies and general questions."
              }
              href={`mailto:${GENERAL_EMAIL}`}
              icon={<Mail aria-hidden="true" className="size-5" />}
              title={ar ? "التواصل العام" : "General contact"}
              value={GENERAL_EMAIL}
            />
            <ContactCard
              body={
                ar
                  ? "رسالة بريد جاهزة بالحقول التي نحتاجها لتشخيص المشكلة."
                  : "A ready email with the fields we need to diagnose it."
              }
              extra={{
                href: REPO_ISSUES,
                label: ar ? "فتح بلاغ على GitHub" : "Open a GitHub issue",
                icon: <Github aria-hidden="true" className="size-4" />,
              }}
              href={bugReportMailto(lang)}
              icon={<Bug aria-hidden="true" className="size-5" />}
              title={ar ? "الإبلاغ عن مشكلة" : "Report a bug"}
              value={ar ? "بالبريد أو على GitHub" : "By email or on GitHub"}
            />
            <ContactCard
              body={
                ar
                  ? "أخبرنا بما تحتاجه والمشكلة التي يحلها."
                  : "Tell us what you need and the problem it solves."
              }
              href={featureRequestMailto(lang)}
              icon={<Lightbulb aria-hidden="true" className="size-5" />}
              title={ar ? "اقتراح ميزة" : "Request a feature"}
              value={SUPPORT_EMAIL}
            />
          </div>
          <div className="border-border flex flex-col gap-3 rounded-2xl border p-5">
            <p className="text-sm font-medium">
              {ar
                ? "تابعنا على الحسابات الرسمية"
                : "Follow the official accounts"}
            </p>
            <SocialIconRow lang={lang} />
          </div>
        </section>
      </main>
    </div>
  );
}

function ContactCard({
  title,
  body,
  href,
  value,
  icon,
  extra,
}: {
  title: string;
  body: string;
  href: string;
  value: string;
  icon: React.ReactNode;
  extra?: { href: string; label: string; icon: React.ReactNode };
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl">
          {icon}
        </span>
        <h3 className="text-lg font-medium">{title}</h3>
      </div>
      <p className="text-muted-foreground text-sm">{body}</p>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        <a
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
          dir={value.includes("@") ? "ltr" : undefined}
          href={href}
        >
          {value}
        </a>
        {extra ? (
          <a
            className="border-border hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm transition-colors"
            href={extra.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {extra.icon}
            {extra.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
