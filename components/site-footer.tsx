import Link from "next/link";
import {
  BILLING_EMAIL,
  COMPANY_ADDRESS,
  COMPANY_COUNTRY,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  COPYRIGHT,
  PRIVACY_EMAIL,
  PRODUCT_NAME,
} from "@/lib/brand";
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
export function SiteFooter({ lang, year }: { lang: Lang; year: number }) {
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
          <p>{COPYRIGHT}</p>
          <p>{COMPANY_LEGAL_NAME_AR}</p>
          <p>{COMPANY_ADDRESS}</p>
          <p>{COMPANY_COUNTRY}</p>
          <p>
            <a href={`tel:${CONTACT_PHONE_E164}`}>
              <bdi dir="ltr">{CONTACT_PHONE_DISPLAY}</bdi>
            </a>
          </p>
          <p>
            <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> ·{" "}
            <a href={`mailto:${BILLING_EMAIL}`}>{BILLING_EMAIL}</a>
          </p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <span className="sr-only">{COMPANY_LEGAL_NAME_EN}</span>
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
