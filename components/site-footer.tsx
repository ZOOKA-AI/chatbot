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
    path: "M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.3-1.5 1.6-1.5h1.6V4.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3H7.6V14h2.7v8h3.2Z",
  },
  {
    id: "telegram",
    label: "Telegram",
    href: "https://t.me/zooka_ai_official",
    path: "M21.9 4.3 19 20c-.2 1-.8 1.2-1.6.8l-4.4-3.3-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.8 13.3 3.4 12c-1-.3-1-1 .2-1.4l17-6.6c.8-.3 1.5.2 1.3 1.3Z",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    href: "https://www.pinterest.com/zookaai/",
    path: "M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.5-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2.4 3.3-5.1 0-2.1-1.4-3.7-4-3.7-2.9 0-4.7 2.2-4.7 4.6 0 .8.2 1.4.6 1.9.2.2.2.3.1.6l-.2.8c0 .3-.3.4-.6.2-1.2-.5-1.8-1.9-1.8-3.4 0-2.5 2.1-5.5 6.4-5.5 3.4 0 5.7 2.5 5.7 5.2 0 3.5-2 6.2-4.9 6.2-1 0-1.9-.5-2.2-1.1l-.6 2.3c-.2.8-.7 1.7-1.1 2.3A10 10 0 1 0 12 2Z",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    href: "https://bsky.app/profile/zookaai.bsky.social",
    path: "M12 10.8C10.9 8.6 8 4.6 5.3 2.8 2.7 1.1 2 1.6 2 3.9c0 .5.3 4.2.5 4.8.6 2.2 2.7 2.8 4.6 2.5-3.3.6-4.1 2.1-2.3 3.9 1.9 1.9 3.3.5 4.6-1.2.7-1 1.4-2 2.6-2s1.9 1 2.6 2c1.3 1.7 2.7 3.1 4.6 1.2 1.8-1.8 1-3.3-2.3-3.9 1.9.3 4-.3 4.6-2.5.2-.6.5-4.3.5-4.8 0-2.3-.7-2.8-3.3-1.1C16 4.6 13.1 8.6 12 10.8Z",
  },
  {
    id: "discord",
    label: "Discord",
    href: "https://discord.gg/7ynqJxMZfQ",
    path: "M19.3 5.6A16 16 0 0 0 15.4 4l-.3.6a12 12 0 0 1 3.4 1.6 11.6 11.6 0 0 0-9-1.5c-.6.1-1.3.4-2 .7a12 12 0 0 1 3.4-1.6L10.6 4a16 16 0 0 0-3.9 1.6C4 9.4 3.3 13 3.6 16.6a16 16 0 0 0 4.8 2.4l.9-1.4c-.7-.3-1.4-.6-2-1l.5-.3a11.5 11.5 0 0 0 9.8 0l.5.3c-.6.4-1.3.7-2 1l.9 1.4a16 16 0 0 0 4.8-2.4c.4-4.2-.6-7.8-2.5-11ZM9.3 14.4c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Zm5.4 0c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Z",
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/ZOOKA-AI",
    path: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
  },
  {
    id: "devto",
    label: "DEV Community",
    href: "https://dev.to/zoka_ai",
    path: "M2 6h20v12H2V6Zm3.3 3.2v5.6h1.6c1 0 1.6-.6 1.6-1.7V10.9c0-1.1-.6-1.7-1.6-1.7H5.3Zm1.3 1.1h.3c.3 0 .5.2.5.6v2.2c0 .4-.2.6-.5.6h-.3v-3.4Zm4.1-1.1v5.6h2.9v-1.1h-1.6v-1.3h1.4v-1.1h-1.4v-1h1.6V9.2h-2.9Zm4.6 0 1 5.6h1.3l1-5.6h-1.3l-.4 3-.4-3h-1.2Z",
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
          <Link className="hover:text-foreground hover:underline" href="/social">
            {ar ? "الحسابات الرسمية" : "Official accounts"}
          </Link>
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
