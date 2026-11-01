import Link from "next/link";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/brand";
import { MASKED_COMPANY_FIELD } from "@/lib/brand-display";
import type { Lang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";

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
 * The single site footer. It used to be rendered twice on the landing page (an
 * inline one plus the legal one), with different links each time.
 */
export function SiteFooter({ lang }: { lang: Lang; year: number }) {
  const ar = lang === "ar";
  return (
    <footer
      className="border-t px-5 py-8 text-sm text-muted-foreground"
      dir={ar ? "rtl" : "ltr"}
      lang={lang}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p>{PRODUCT_NAME}</p>
          <p>
            <bdi dir="ltr">
              © 2026 {MASKED_COMPANY_FIELD}. All rights reserved.
            </bdi>
          </p>
          <p>{MASKED_COMPANY_FIELD}</p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="hover:underline" href="/explore">
            {ar ? "اكتشف المنصة" : "Explore"}
          </Link>
          <Link className="hover:underline" href="/studio">
            Studio
          </Link>
          <Link className="hover:underline" href="/platform-readiness">
            {ar ? "الجاهزية" : "Readiness"}
          </Link>
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
