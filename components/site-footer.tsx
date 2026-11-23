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
 * Official accounts. Every `href` here was verified live (HTTP 200 on the public
 * page) before it was added; a network without an href renders as "coming soon"
 * instead of a link. Instagram is deliberately unlinked: the account is under
 * review and its profile is not publicly available yet.
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
    href: "https://x.com/zooka_ai",
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
    href: "https://www.linkedin.com/company/zooka-ai/",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.1c.5-1 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6v5.4h-4v-4.8c0-1.1 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5v4.9h-4v-11Z",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@zooka.ai7",
    path: "M16.5 3c.4 2 1.7 3.4 3.5 3.7v3.1a7 7 0 0 1-3.5-1v6.4A5.8 5.8 0 1 1 10.7 9.4v3.2a2.7 2.7 0 1 0 2.7 2.6V3h3.1Z",
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@zooka_ai_official",
    path: "M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/61596724862442",
    path:
      "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  {
    id: "telegram",
    label: "Telegram",
    href: "https://t.me/zooka_ai_official",
    path:
      "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    href: "https://www.pinterest.com/zookaai",
    path:
      "M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z",
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/ZOOKA-AI",
    path:
      "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
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
