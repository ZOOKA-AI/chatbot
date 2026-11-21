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
import { FOOTER_ACCOUNTS as SOCIALS } from "@/lib/social-accounts";

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
