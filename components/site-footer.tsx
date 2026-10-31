import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";

const LINKS: readonly (readonly [string, LegalPageId | "compare" | "partners"])[] = [
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
 * The single site footer. It used to be rendered twice on the landing page (an
 * inline one plus the legal one), with different links each time.
 */
export function SiteFooter({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <footer
      className="border-t px-5 py-8 text-sm text-muted-foreground"
      dir={ar ? "rtl" : "ltr"}
      lang={lang}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} ZOOKA AI</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map(([href, page]) => (
            <Link className="hover:underline" href={href} key={href}>
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
      </div>
    </footer>
  );
}
