import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";

/** Zooka AI has been in development since late 2024. */
const FOUNDED_YEAR = 2024;
const SUPPORT_EMAIL = "support@zooka-ai.com";

const LINKS: readonly (readonly [
  string,
  LegalPageId | "compare" | "partners",
])[] = [
  ["/compare/chatgpt", "compare"],
  ["/partners", "partners"],
  ["/about", "about"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/refund", "refund"],
  ["/contact", "contact"],
  ["/cookies", "cookies"],
];

/**
 * Official accounts. A network stays "coming soon" (no link) until its
 * `href` is filled in — we never link to a handle we do not own.
 */
const SOCIALS: { id: string; label: string; href?: string; path: string }[] = [
  {
    id: "discord",
    label: "Discord",
    href: "https://discord.gg/7ynqJxMZfQ",
    path:
      "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.1.246.199.373.293a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419Z",
  },
  {
    id: "x",
    label: "X",
    path: "M17.5 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.2L5.6 21h-3l7.1-8.1L2 3h6.2l4.3 5.7L17.5 3Zm-1 16.2h1.7L7.6 4.7H5.8l10.7 14.5Z",
  },
  {
    id: "instagram",
    label: "Instagram",
    path: "M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6A3 3 0 1 1 12 9a3 3 0 0 1 0 6Zm5.9-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8.1c-.1-1.4-.4-2.7-1.4-3.7S17.3 3.1 15.9 3c-1.5-.1-6.3-.1-7.8 0-1.4.1-2.7.4-3.7 1.4S3.1 6.7 3 8.1c-.1 1.5-.1 6.3 0 7.8.1 1.4.4 2.7 1.4 3.7s2.3 1.3 3.7 1.4c1.5.1 6.3.1 7.8 0 1.4-.1 2.7-.4 3.7-1.4s1.3-2.3 1.4-3.7c.1-1.5.1-6.3 0-7.8Z",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.1c.5-1 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6v5.4h-4v-4.8c0-1.1 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5v4.9h-4v-11Z",
  },
  {
    id: "tiktok",
    label: "TikTok",
    path: "M16.5 3c.4 2 1.7 3.4 3.5 3.7v3.1a7 7 0 0 1-3.5-1v6.4A5.8 5.8 0 1 1 10.7 9.4v3.2a2.7 2.7 0 1 0 2.7 2.6V3h3.1Z",
  },
  {
    id: "youtube",
    label: "YouTube",
    path: "M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
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
      className={`border-t text-muted-foreground text-sm ${embedded ? "px-1 pt-8 pb-4" : "px-5 py-10"}`}
      data-site-footer={embedded ? "embedded" : "global"}
      dir={ar ? "rtl" : "ltr"}
      lang={lang}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-bold text-base text-foreground">Zooka AI</p>
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
            className="flex items-center gap-2"
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
                      className="zk-neon-hover flex size-9 items-center justify-center rounded-full border text-foreground"
                      href={social.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {icon}
                    </a>
                  ) : (
                    <span
                      aria-label={`${social.label} — ${ar ? "قريبًا" : "coming soon"}`}
                      className="flex size-9 cursor-default items-center justify-center rounded-full border opacity-50"
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
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          <Link className="hover:text-foreground hover:underline" href="/explore">
            {ar ? "اكتشف المنصة" : "Explore"}
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/studio">
            Studio
          </Link>
          <Link
            className="hover:text-foreground hover:underline"
            href="/platform-readiness"
          >
            {ar ? "الجاهزية" : "Readiness"}
          </Link>
          <Link
            className="hover:text-foreground hover:underline"
            href="/developer"
          >
            {ar ? "المطوّر" : "Developer"}
          </Link>
          {LINKS.map(([href, page]) => (
            <Link
              className="hover:text-foreground hover:underline"
              href={href}
              key={href}
            >
              {page === "compare"
                ? ar
                  ? "زوكا مقابل ChatGPT"
                  : "Zooka vs ChatGPT"
                : page === "partners"
                  ? ar
                    ? "الشركاء"
                    : "Partners"
                  : getLegalPageCopy(lang, page).title}
            </Link>
          ))}
        </nav>

        <p className="border-t pt-4 text-xs">
          {ar
            ? `© ${years} جميع الحقوق محفوظة لمنصة Zooka AI — zooka-ai.com`
            : `© ${years} All rights reserved to the Zooka AI platform — zooka-ai.com`}
        </p>
      </div>
    </footer>
  );
}
