import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Lang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";
/**
 * Official accounts. A network stays "coming soon" (no link) until its
 * `href` is filled in — we never link to a handle we do not own.
 */
import { FOOTER_ACCOUNTS as SOCIALS } from "@/lib/social-accounts";

/** Zooka AI has been in development since late 2024. */
const FOUNDED_YEAR = 2024;
const SUPPORT_EMAIL = "support@zooka-ai.com";

interface FooterLink {
  href: string;
  ar: string;
  en: string;
  external?: boolean;
}

const LEGAL: readonly LegalPageId[] = ["privacy", "terms", "refund", "cookies"];

const COLUMNS: { id: string; ar: string; en: string; links: FooterLink[] }[] = [
  {
    id: "product",
    ar: "المنتج",
    en: "Product",
    links: [
      { href: "/", ar: "المحادثة الذكية", en: "AI Chat" },
      { href: "/workspace/agents", ar: "الوكلاء", en: "Agents" },
      { href: "/workspace/automations", ar: "الأتمتة", en: "Automation" },
      { href: "/settings/integrations", ar: "التكاملات", en: "Integrations" },
      { href: "/studio", ar: "الاستوديو", en: "Studio" },
      { href: "/tv", ar: "ZOOKA AI TV", en: "ZOOKA AI TV" },
      { href: "/pricing", ar: "الأسعار", en: "Pricing" },
    ],
  },
  {
    id: "developers",
    ar: "المطورون",
    en: "Developers",
    links: [
      { href: "/settings/mcp", ar: "MCP ومفاتيح الربط", en: "MCP and keys" },
      {
        href: "https://github.com/ZOOKA-AI/chatbot",
        ar: "GitHub",
        en: "GitHub",
        external: true,
      },
      { href: "/platform-readiness", ar: "الجاهزية", en: "Readiness" },
      { href: "/developer", ar: "عن المطوّر", en: "About the developer" },
    ],
  },
  {
    id: "company",
    ar: "الشركة",
    en: "Company",
    links: [
      { href: "/about", ar: "من نحن", en: "About" },
      { href: "/contact", ar: "تواصل معنا", en: "Contact" },
      { href: "/social", ar: "الحسابات الرسمية", en: "Official accounts" },
      { href: "/partners", ar: "الشركاء", en: "Partners" },
      { href: "/blog", ar: "المدونة", en: "Blog" },
      { href: "/explore", ar: "اكتشف المنصة", en: "Explore" },
      {
        href: "/compare/chatgpt",
        ar: "زوكا مقابل ChatGPT",
        en: "Zooka vs ChatGPT",
      },
    ],
  },
  {
    id: "support",
    ar: "الدعم",
    en: "Support",
    links: [
      { href: "/support", ar: "مركز المساعدة", en: "Help Center" },
      { href: "/support#faq", ar: "الأسئلة الشائعة", en: "FAQ" },
      {
        href: "/support#contact",
        ar: "الإبلاغ عن مشكلة",
        en: "Report an issue",
      },
      {
        href: `mailto:${SUPPORT_EMAIL}`,
        ar: SUPPORT_EMAIL,
        en: SUPPORT_EMAIL,
        external: true,
      },
    ],
  },
];

/**
 * The single site footer: brand and rights, support contact, official
 * accounts and the legal links. `embedded` renders it inside the chat home
 * (end of the scroll); the global one is hidden while the chat app is open.
 */
export function SiteFooter({
  lang,
  year,
  embedded = false,
}: {
  lang: Lang;
  year: number;
  embedded?: boolean;
}) {
  const ar = lang === "ar";
  const years =
    year > FOUNDED_YEAR ? `${FOUNDED_YEAR}–${year}` : `${FOUNDED_YEAR}`;

  return (
    <footer
      className={`text-muted-foreground border-t text-sm ${embedded ? "px-1 pt-8 pb-4" : "px-5 py-10"}`}
      data-site-footer={embedded ? "embedded" : "global"}
      dir={ar ? "rtl" : "ltr"}
      lang={lang}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-base font-bold">Zooka AI</p>
            <p>
              {ar
                ? "وكيل أعمال ذكي لشركات الخدمات."
                : "An AI business agent for service companies."}
            </p>
            <p>
              {ar ? "الدعم: " : "Support: "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>

          <ul
            aria-label={ar ? "حساباتنا الرسمية" : "Official accounts"}
            className="flex flex-wrap items-center gap-2"
          >
            {SOCIALS.map((social) => {
              const icon = (
                <svg
                  aria-hidden="true"
                  className="size-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d={social.path} />
                </svg>
              );
              return (
                <li key={social.id}>
                  {social.href ? (
                    <a
                      aria-label={social.label}
                      className="zk-neon-hover text-foreground flex size-10 items-center justify-center rounded-full border"
                      href={social.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {icon}
                    </a>
                  ) : (
                    <span
                      aria-label={`${social.label} — ${ar ? "قريبًا" : "coming soon"}`}
                      className="flex size-10 cursor-default items-center justify-center rounded-full border opacity-50"
                      role="img"
                      title={`${social.label} — ${ar ? "قريبًا" : "coming soon"}`}
                    >
                      {icon}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <nav
          aria-label={ar ? "روابط الموقع" : "Site links"}
          className="grid grid-cols-2 gap-x-6 gap-y-8 border-t pt-8 sm:grid-cols-3 lg:grid-cols-5"
        >
          {COLUMNS.map((column) => (
            <div className="flex flex-col gap-3" key={column.id}>
              <p className="text-foreground font-mono text-[11px] font-semibold tracking-[0.18em] uppercase">
                {ar ? column.ar : column.en}
              </p>
              <ul className="flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        className="hover:text-foreground inline-flex min-h-8 items-center break-all hover:underline"
                        href={link.href}
                        rel={
                          link.href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        target={
                          link.href.startsWith("http") ? "_blank" : undefined
                        }
                      >
                        {ar ? link.ar : link.en}
                      </a>
                    ) : (
                      <Link
                        className="hover:text-foreground inline-flex min-h-8 items-center hover:underline"
                        href={link.href}
                      >
                        {ar ? link.ar : link.en}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-col gap-3">
            <p className="text-foreground font-mono text-[11px] font-semibold tracking-[0.18em] uppercase">
              {ar ? "القانونية" : "Legal"}
            </p>
            <ul className="flex flex-col gap-1">
              {LEGAL.map((page) => (
                <li key={page}>
                  <Link
                    className="hover:text-foreground inline-flex min-h-8 items-center hover:underline"
                    href={`/${page}`}
                  >
                    {getLegalPageCopy(lang, page).title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="flex flex-col gap-3 border-t pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            {ar
              ? `© ${years} جميع الحقوق محفوظة لمنصة Zooka AI — zooka-ai.com`
              : `© ${years} All rights reserved to the Zooka AI platform — zooka-ai.com`}
          </p>
          <div className="flex items-center gap-2">
            <LanguageToggle
              className="hover:bg-muted inline-flex min-h-10 items-center rounded-lg border px-3 text-xs transition-colors"
              lang={lang}
            />
            <ThemeToggle
              className="hover:bg-muted inline-flex size-10 items-center justify-center rounded-lg border transition-colors"
              lang={lang}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
